// New node implementation for seqera-datalink-list
module.exports = function (RED) {
  function SeqeraDatalinkListNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
    node.dataLinkNameProp = config.dataLinkName;
    node.dataLinkNamePropType = config.dataLinkNameType;
    node.basePathProp = config.basePath;
    node.basePathPropType = config.basePathType;
    node.prefixProp = config.prefix;
    node.prefixPropType = config.prefixType;
    node.patternProp = config.pattern;
    node.patternPropType = config.patternType;
    node.maxResultsProp = config.maxResults;
    node.maxResultsPropType = config.maxResultsType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.tokenProp = config.token;
    node.tokenPropType = config.tokenType;
    node.depthProp = config.depth;
    node.depthPropType = config.depthType;

    // Reference Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      node.status({ fill: "blue", shape: "ring", text: `listing: ${formatDateTime()}` });

      // Helper to evaluate properties (supports jsonata)
      const evalProp = async (p, t) => {
        if (t === "jsonata") {
          const expr = RED.util.prepareJSONataExpression(p, node);
          return await new Promise((resolve, reject) => {
            RED.util.evaluateJSONataExpression(expr, msg, (err, value) => {
              if (err) return reject(err);
              resolve(value);
            });
          });
        }
        return RED.util.evaluateNodeProperty(p, t, node, msg);
      };

      try {
        // Evaluate all properties
        const dataLinkName = await evalProp(node.dataLinkNameProp, node.dataLinkNamePropType);
        const basePathRaw = await evalProp(node.basePathProp, node.basePathPropType);
        const prefix = await evalProp(node.prefixProp, node.prefixPropType);
        const patternRaw = await evalProp(node.patternProp, node.patternPropType);
        const maxResultsRaw = await evalProp(node.maxResultsProp, node.maxResultsPropType);
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);
        const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
        const tokenOverride = await evalProp(node.tokenProp, node.tokenPropType);
        const depthRaw = await evalProp(node.depthProp, node.depthPropType);
        const depthVal = Math.max(0, parseInt(depthRaw, 10) || 0);

        const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;
        const maxResults = parseInt(maxResultsRaw, 10) || 100;
        const basePath = basePathRaw != null ? String(basePathRaw) : "";

        if (!dataLinkName) throw new Error("dataLinkName not provided");

        // Helper to build auth headers
        const buildHeaders = () => {
          const headers = { Accept: "application/json" };
          const token =
            tokenOverride ||
            (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
            (node.credentials && node.credentials.token);
          if (token) headers["Authorization"] = `Bearer ${token}`;
          return headers;
        };

        // 1) Resolve dataLinkId and credentialsId by name search
        let dataLinkId;
        let credentialsId;
        {
          const qs = new URLSearchParams();
          if (workspaceId != null) qs.append("workspaceId", workspaceId);
          qs.append("pageSize", "2");
          qs.append("search", dataLinkName);
          const searchUrl = `${baseUrl.replace(/\/$/, "")}/data-links/?${qs.toString()}`;
          msg._seqera_datalink_search_request = { method: "GET", url: searchUrl, headers: buildHeaders() };
          const resp = await axios.get(searchUrl, { headers: buildHeaders() });
          const links = resp.data?.dataLinks || [];
          if (links.length == 0) {
            throw new Error(`Could not find Data Link '${dataLinkName}'`);
          }
          if (links.length !== 1) {
            throw new Error(`Found more than one Data Link matching '${dataLinkName}'`);
          }
          dataLinkId = links[0].id;
          if (!dataLinkId) throw new Error("Matched data link does not have an id");
          if (Array.isArray(links[0].credentials) && links[0].credentials.length) {
            credentialsId = links[0].credentials[0].id;
          }
        }

        // Recursive fetch respecting depth
        const allItems = [];

        const fetchPath = async (currentPath, currentDepth) => {
          if (allItems.length >= maxResults) return;

          let nextPage = null;
          do {
            const encodedPath = currentPath
              .split("/")
              .filter((p) => p !== "")
              .map(encodeURIComponent)
              .join("/");

            let url = `${baseUrl.replace(/\/$/, "")}/data-links/${encodeURIComponent(
              dataLinkId,
            )}/browse/${encodedPath}`;

            const qs = new URLSearchParams();
            if (workspaceId != null) qs.append("workspaceId", workspaceId);
            if (prefix != null && prefix !== "") qs.append("search", prefix);
            if (credentialsId) qs.append("credentialsId", credentialsId);
            if (nextPage) qs.append("nextPageToken", nextPage);
            const qsStr = qs.toString();
            if (qsStr.length) url += `?${qsStr}`;

            const resp = await axios.get(url, { headers: buildHeaders() });
            const data = resp.data || {};
            const objects = Array.isArray(data.objects) ? data.objects : [];

            if (objects.length) {
              const mapped = objects.map((o) => {
                const prefix = currentPath ? `${currentPath}/` : "";
                return { ...o, name: `${prefix}${o.name}` };
              });
              const remaining = maxResults - allItems.length;
              allItems.push(...mapped.slice(0, remaining));
            }

            // Recurse into folders if depth allows
            if (currentDepth < depthVal && allItems.length < maxResults) {
              const folders = objects.filter((o) => (o.type || "").toUpperCase() === "FOLDER");
              for (const folder of folders) {
                if (allItems.length >= maxResults) break;
                const folderNameClean = folder.name.replace(/\/$/, "");
                const newPath = currentPath ? `${currentPath}/${folderNameClean}` : folderNameClean;
                await fetchPath(newPath, currentDepth + 1);
              }
            }

            nextPage = data.nextPageToken || data.nextPage || null;
          } while (nextPage && allItems.length < maxResults);
        };

        await fetchPath(basePath, 0);

        // Apply regex pattern filter if provided
        let finalItems = allItems;
        if (patternRaw && patternRaw !== "") {
          try {
            const regex = new RegExp(patternRaw);
            finalItems = allItems.filter((it) => regex.test(it.name));
          } catch (e) {
            node.warn(`Invalid regex pattern: ${patternRaw}`);
          }
        }

        msg.payload = finalItems;
        node.status({ fill: "green", shape: "dot", text: `done: ${finalItems.length} items` });
        send(msg);
        if (done) done();
      } catch (err) {
        msg._seqera_error = err.response
          ? { status: err.response.status, data: err.response.data }
          : { message: err.message };
        node.error(`Seqera datalink list failed: ${err.message}`, msg);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        send(msg);
        if (done) done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-datalink-list", SeqeraDatalinkListNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      dataLinkName: { value: "dataLinkName" },
      dataLinkNameType: { value: "str" },
      basePath: { value: "" },
      basePathType: { value: "str" },
      prefix: { value: "" },
      prefixType: { value: "str" },
      pattern: { value: "" },
      patternType: { value: "str" },
      maxResults: { value: "100" },
      maxResultsType: { value: "num" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "str" },
      baseUrl: { value: "baseUrl" },
      baseUrlType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
      depth: { value: "0" },
      depthType: { value: "num" },
    },
  });
};
