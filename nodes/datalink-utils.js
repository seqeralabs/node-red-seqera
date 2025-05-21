const axios = require("axios");

/**
 * Helper to evaluate a typed-input property value, supporting JSONata.
 * Returns a Promise resolving to the evaluated value.
 */
async function evalProp(RED, node, msg, value, type) {
  if (type === "jsonata") {
    const expr = RED.util.prepareJSONataExpression(value, node);
    return new Promise((resolve, reject) => {
      RED.util.evaluateJSONataExpression(expr, msg, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  }
  return RED.util.evaluateNodeProperty(value, type, node, msg);
}

/**
 * Core implementation that lists objects from a Seqera Platform Data Link.
 *
 * The logic relies on `node` having the same property names as the existing
 * `seqera-datalink-list` node (eg. `dataLinkNameProp`, `workspaceIdProp` etc).
 *
 * Returns an object `{ items, files }` where `items` is an array of objects
 * and `files` is an array containing just the names.
 */
async function listDataLink(RED, node, msg = {}) {
  // Evaluate all configurable inputs
  const dataLinkName = await evalProp(RED, node, msg, node.dataLinkNameProp, node.dataLinkNamePropType);
  const basePathRaw = await evalProp(RED, node, msg, node.basePathProp, node.basePathPropType);
  const prefix = await evalProp(RED, node, msg, node.prefixProp, node.prefixPropType);
  const patternRaw = await evalProp(RED, node, msg, node.patternProp, node.patternPropType);
  const maxResultsRaw = await evalProp(RED, node, msg, node.maxResultsProp, node.maxResultsPropType);
  const workspaceIdOv = await evalProp(RED, node, msg, node.workspaceIdProp, node.workspaceIdPropType);
  const baseUrlOv = await evalProp(RED, node, msg, node.baseUrlProp, node.baseUrlPropType);
  const tokenOv = await evalProp(RED, node, msg, node.tokenProp, node.tokenPropType);
  const depthRaw = await evalProp(RED, node, msg, node.depthProp, node.depthPropType);

  if (!dataLinkName) {
    throw new Error("dataLinkName not provided");
  }

  const depthVal = Math.max(0, parseInt(depthRaw, 10) || 0);
  const maxResults = parseInt(maxResultsRaw, 10) || 100;
  const basePath = basePathRaw != null ? String(basePathRaw) : "";
  const baseUrl = baseUrlOv || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
  const workspaceId = workspaceIdOv || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

  // Helper to construct auth headers
  const buildHeaders = () => {
    const headers = { Accept: "application/json" };
    const token = tokenOv || node.seqeraConfig?.credentials?.token || node.credentials?.token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  /* -----------------------------------------------------------
   * 1) Resolve Data Link ID & credentials
   * --------------------------------------------------------- */
  const dlSearchQS = new URLSearchParams();
  if (workspaceId != null) dlSearchQS.append("workspaceId", workspaceId);
  dlSearchQS.append("pageSize", "2");
  dlSearchQS.append("search", dataLinkName);
  const searchUrl = `${baseUrl.replace(/\/$/, "")}/data-links/?${dlSearchQS.toString()}`;
  msg._seqera_datalink_search_request = { method: "GET", url: searchUrl, headers: buildHeaders() };

  const searchResp = await axios.get(searchUrl, { headers: buildHeaders() });
  const links = searchResp.data?.dataLinks || [];
  if (!links.length) throw new Error(`Could not find Data Link '${dataLinkName}'`);
  if (links.length !== 1) throw new Error(`Found more than one Data Link matching '${dataLinkName}'`);

  const dataLinkId = links[0].id;
  const credentialsId = links[0].credentials?.[0]?.id;
  const resourceRef = links[0].resourceRef;
  const resourceType = links[0].type;
  const provider = links[0].provider;

  /* -----------------------------------------------------------
   * 2) Recursive browse of paths (depth & pagination aware)
   * --------------------------------------------------------- */
  const allItems = [];

  const fetchPath = async (currentPath, currentDepth) => {
    if (allItems.length >= maxResults) return;

    let nextPage = null;
    do {
      const encodedPath = currentPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");

      let url = `${baseUrl.replace(/\/$/, "")}/data-links/${encodeURIComponent(dataLinkId)}/browse/${encodedPath}`;

      const qs = new URLSearchParams();
      if (workspaceId != null) qs.append("workspaceId", workspaceId);
      if (prefix) qs.append("search", prefix);
      if (credentialsId) qs.append("credentialsId", credentialsId);
      if (nextPage) qs.append("nextPageToken", nextPage);
      const qsStr = qs.toString();
      if (qsStr) url += `?${qsStr}`;

      const resp = await axios.get(url, { headers: buildHeaders() });
      const objects = Array.isArray(resp.data?.objects) ? resp.data.objects : [];

      if (objects.length) {
        const mapped = objects.map((o) => {
          const p = currentPath ? `${currentPath}/` : "";
          return { ...o, name: `${p}${o.name}` };
        });
        const remaining = maxResults - allItems.length;
        allItems.push(...mapped.slice(0, remaining));
      }

      // recurse into folders if depth allows
      if (currentDepth < depthVal && allItems.length < maxResults) {
        const folders = objects.filter((o) => (o.type || "").toUpperCase() === "FOLDER");
        for (const folder of folders) {
          if (allItems.length >= maxResults) break;
          const clean = folder.name.replace(/\/$/, "");
          const newPath = currentPath ? `${currentPath}/${clean}` : clean;
          await fetchPath(newPath, currentDepth + 1);
        }
      }

      nextPage = resp.data.nextPageToken || resp.data.nextPage || null;
    } while (nextPage && allItems.length < maxResults);
  };

  await fetchPath(basePath, 0);

  /* -----------------------------------------------------------
   * 3) Post-processing filters
   * --------------------------------------------------------- */
  let finalItems = allItems;
  if (patternRaw) {
    try {
      const re = new RegExp(patternRaw);
      finalItems = allItems.filter((it) => re.test(it.name));
    } catch (e) {
      node.warn(`Invalid regex pattern: ${patternRaw}`);
    }
  }

  if (node.returnType === "files") {
    finalItems = finalItems.filter((it) => (it.type || "").toUpperCase() === "FILE");
  } else if (node.returnType === "folders") {
    finalItems = finalItems.filter((it) => (it.type || "").toUpperCase() === "FOLDER");
  }

  return {
    items: finalItems,
    files: finalItems.map((f) => f.name),
    resourceType,
    resourceRef,
    provider,
  };
}

module.exports = {
  listDataLink,
};
