module.exports = function (RED) {
  function SeqeraWorkflowNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Reference to shared Seqera configuration node (optional)
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    // Fallback base URL if no config provided
    node.baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || config.baseUrl || "https://api.cloud.seqera.io";

    // Fallback credentials for backwards-compatibility (deprecated)
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");

    node.on("input", async function (msg, send, done) {
      // Show status: running
      node.status({ fill: "blue", shape: "ring", text: `${new Date().toLocaleTimeString()} querying` });

      // Allow msg overrides and shared config
      const baseUrl = msg.baseUrl || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.baseUrl;
      const workflowId = msg.workflowId;
      const workspaceId = msg.workspaceId || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

      if (!workflowId) {
        done(new Error("workflowId must be provided in msg.workflowId"));
        return;
      }

      let url = `${baseUrl.replace(/\/$/, "")}/workflow/${workflowId}`;
      if (workspaceId) {
        url += `?workspaceId=${workspaceId}`;
      }

      const headers = {};
      // Determine token priority: msg.token > config node > (deprecated) local credentials
      const token =
        msg.token ||
        (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
        (node.credentials && node.credentials.token);
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      try {
        const response = await axios.get(url, { headers });
        msg.payload = response.data;
        // Convenience: expose workflowId at msg level for downstream nodes
        if (response.data && response.data.workflow && response.data.workflow.id) {
          msg.workflowId = response.data.workflow.id;
        }

        // Success status showing workflow status
        const wfStatus = response.data && response.data.workflow && response.data.workflow.status;
        node.status({ fill: "green", shape: "dot", text: `${new Date().toLocaleTimeString()} ${wfStatus || "ok"}` });

        // Determine output based on status regex
        const re = /^(submitted|running)$/i;
        if (re.test(wfStatus || "")) {
          send([msg, null]);
        } else {
          send([null, msg]);
        }
        if (done) done();
      } catch (err) {
        msg._seqera_request = { method: "GET", url, headers };
        msg._seqera_error = err.response
          ? { status: err.response.status, data: err.response.data }
          : { message: err.message };
        node.error(`Seqera API request failed: ${err.message}\nRequest: GET ${url}`, msg);
        node.status({ fill: "red", shape: "ring", text: `${new Date().toLocaleTimeString()} error` });
        send([null, msg]);
        if (done) done(err);
      }
    });
  }

  // Register with legacy credential support for backwards compatibility (token field hidden in UI)
  RED.nodes.registerType("seqera-workflow", SeqeraWorkflowNode, {
    credentials: {
      token: { type: "password" },
    },
  });
};
