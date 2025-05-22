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
      request: { method: method.toUpperCase(), url, ...finalOpts },
    });
    throw err;
  }
}

module.exports = { buildHeaders, apiCall };
