/*
 * Shared utility helpers for Seqera Platform Node-RED nodes.
 */

const axios = require("axios");

/**
 * Build HTTP headers for Seqera Platform API calls.
 *
 * The helper always injects the Bearer token stored in the shared
 * `seqera-config` node (if present) and merges any additional headers
 * that you pass via `extraHeaders`.
 *
 * Usage:
 *   const headers = buildHeaders(node, { "Content-Type": "application/json" });
 *
 * @param {object} node - The Node-RED node instance (must reference a seqera-config node).
 * @param {object} [extraHeaders={}] - Optional extra headers to include.
 * @returns {object} The complete headers object.
 */
function buildHeaders(node, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const token = node.seqeraConfig.credentials.token;
  headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * Perform an Axios request wrapped in try/catch.
 * Logs failing requests with node.warn and re-throws the error.
 *
 * @param {object} node   – Node-RED node (used for logging).
 * @param {string} method – HTTP method (get, post, put, delete, etc.).
 * @param {string} url    – Request URL.
 * @param {object} [options={}] – Axios request options (headers, data, etc.).
 * @returns {Promise<import("axios").AxiosResponse>}
 */
async function apiCall(node, method, url, options = {}) {
  const optHeaders = options.headers || {};
  const mergedHeaders = { ...buildHeaders(node), ...optHeaders };
  const finalOpts = { ...options, headers: mergedHeaders };
  try {
    return await axios.request({ method, url, ...finalOpts });
  } catch (err) {
    finalOpts.headers["Authorization"] = `Bearer *********`;
    node.warn({
      message: `Seqera API ${method.toUpperCase()} call to ${url} failed`,
      error: err,
      response: err.response?.data, // Include API error response
      request: { method: method.toUpperCase(), url, ...finalOpts },
    });
    throw err;
  }
}

/**
 * Generic resource resolver for Seqera Platform API.
 * Resolves a resource name to its ID by querying the appropriate endpoint.
 *
 * Supported resource types:
 * - credentials: /credentials → credentials[].id
 * - data-links: /data-links → dataLinks[].id
 * - pipelines: /pipelines → pipelines[].pipelineId
 * - compute-envs: /compute-envs → computeEnvs[].id
 * - datasets: /datasets → datasets[].id
 *
 * @param {object} RED - Node-RED runtime
 * @param {object} node - Node-RED node instance
 * @param {object} msg - Message object (for JSONata context)
 * @param {string} resourceType - Type of resource (e.g., 'credentials', 'data-links', 'pipelines')
 * @param {string} resourceName - Name of the resource to resolve
 * @param {object} options - Options object with baseUrl and workspaceId
 * @returns {Promise<string|null>} The resource ID, or null if resourceName is empty
 */
async function resolveResource(RED, node, msg, resourceType, resourceName, { baseUrl, workspaceId = null } = {}) {
  if (!resourceName || resourceName.trim() === "") {
    return null; // No resource specified
  }

  // Define metadata for each resource type
  const resourceConfig = {
    credentials: {
      endpoint: "/credentials",
      responseKey: "credentials",
      idField: "id",
      nameField: "name",
      queryParams: { pageSize: "100" },
    },
    "data-links": {
      endpoint: "/data-links",
      responseKey: "dataLinks",
      idField: "id",
      nameField: "name",
      queryParams: { pageSize: "100", search: resourceName },
    },
    pipelines: {
      endpoint: "/pipelines",
      responseKey: "pipelines",
      idField: "pipelineId",
      nameField: "name",
      queryParams: { max: "50", offset: "0", search: resourceName, visibility: "all" },
    },
    "compute-envs": {
      endpoint: "/compute-envs",
      responseKey: "computeEnvs",
      idField: "id",
      nameField: "name",
      queryParams: { max: "100" },
    },
    datasets: {
      endpoint: "/datasets",
      responseKey: "datasets",
      idField: "id",
      nameField: "name",
      queryParams: { max: "100" },
    },
  };

  const config = resourceConfig[resourceType];
  if (!config) {
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  // Build query string
  const qs = new URLSearchParams();
  if (workspaceId != null) qs.append("workspaceId", workspaceId);
  for (const [key, value] of Object.entries(config.queryParams)) {
    qs.append(key, value);
  }

  const searchUrl = `${baseUrl.replace(/\/$/, "")}${config.endpoint}?${qs.toString()}`;

  const searchResp = await apiCall(node, "get", searchUrl, { headers: { Accept: "application/json" } });
  const items = searchResp.data?.[config.responseKey] || [];

  // Find exact match by name
  const matchingItems = items.filter((item) => item[config.nameField] === resourceName);

  if (!matchingItems.length) {
    throw new Error(`Could not find ${resourceType.replace("-", " ")} with name '${resourceName}'`);
  }
  if (matchingItems.length > 1) {
    throw new Error(
      `Found ${matchingItems.length} ${resourceType.replace(
        "-",
        " ",
      )}s with name '${resourceName}'. Please use a unique name.`,
    );
  }

  return matchingItems[0][config.idField];
}

/**
 * Shared handler for datalink auto-complete HTTP endpoint.
 * Used by both datalink-list and datalink-poll nodes.
 *
 * @param {object} RED - Node-RED runtime
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function handleDatalinkAutoComplete(RED, req, res) {
  try {
    const nodeId = req.params.nodeId;
    const search = req.query.search || "";

    // Try to get the node, but it might not exist yet if this is a new node
    let node = RED.nodes.getNode(nodeId);
    let seqeraConfigId = null;
    let baseUrl = "https://api.cloud.seqera.io";
    let workspaceId = null;

    if (node && node.seqeraConfig) {
      // Node exists and has config
      seqeraConfigId = node.seqeraConfig.id;
      baseUrl = node.seqeraConfig.baseUrl || baseUrl;
      workspaceId = node.seqeraConfig.workspaceId;

      // Check for workspace ID override in the node configuration
      if (node.workspaceIdProp && node.workspaceIdPropType === "str" && node.workspaceIdProp.trim()) {
        workspaceId = node.workspaceIdProp;
      }
    } else {
      // Try to get config ID from request body or query params
      seqeraConfigId = req.query.seqeraConfig || req.body?.seqeraConfig;
      if (seqeraConfigId) {
        const configNode = RED.nodes.getNode(seqeraConfigId);
        if (configNode) {
          baseUrl = configNode.baseUrl || baseUrl;
          workspaceId = configNode.workspaceId;
        }
      }
    }

    // Also check for workspace ID override in query parameters (from frontend)
    if (req.query.workspaceId && req.query.workspaceId.trim()) {
      workspaceId = req.query.workspaceId;
    }

    if (!workspaceId) {
      return res.json([]); // Return empty array instead of error for better UX
    }

    // Create a temporary node-like object for apiCall if we don't have a real node
    const nodeForApi = node || {
      seqeraConfig: RED.nodes.getNode(seqeraConfigId),
      warn: () => {}, // Dummy warn function
    };

    if (!nodeForApi.seqeraConfig) {
      return res.json([]);
    }

    // Build the data-links API URL with search parameter
    const params = new URLSearchParams({ workspaceId });
    if (search) {
      params.append("search", search);
    }
    const dataLinksUrl = `${baseUrl.replace(/\/$/, "")}/data-links?${params.toString()}`;

    const response = await apiCall(nodeForApi, "get", dataLinksUrl, {
      headers: { Accept: "application/json" },
    });

    const dataLinks = response.data?.dataLinks || [];

    const results = dataLinks.map((dataLink) => ({
      value: dataLink.name,
      label: dataLink.name,
    }));

    res.json(results);
  } catch (error) {
    // Return empty array on error for better UX
    res.json([]);
  }
}

module.exports = { buildHeaders, apiCall, resolveResource, handleDatalinkAutoComplete };
