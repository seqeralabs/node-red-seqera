module.exports = function (RED) {
  function SeqeraWorkflowNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Configurable typedInput properties
    node.workflowIdProp = config.workflowId;
    node.workflowIdPropType = config.workflowIdType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;

    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    // Default base URL if no config provided
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    // Credentials (deprecated local credentials, config node credentials still used)
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");
    const { apiCall } = require("./_utils");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      const workflowId = RED.util.evaluateNodeProperty(node.workflowIdProp, node.workflowIdPropType, node, msg);
      const workspaceIdOverride = RED.util.evaluateNodeProperty(
        node.workspaceIdProp,
        node.workspaceIdPropType,
        node,
        msg,
      );

      if (!workflowId) {
        done(new Error("workflowId not provided"));
        return;
      }

      // Get workspace ID from override, config node, or null as fallback
      const workspaceId =
        workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || msg.workspaceId || null;

      let url = `${node.defaultBaseUrl.replace(/\/$/, "")}/workflow/${workflowId}`;
      if (workspaceId) url += `?workspaceId=${workspaceId}`;

      try {
        const response = await apiCall(node, "get", url);
        msg.payload = response.data;
        msg.workflowId = response.data?.workflow?.id || workflowId;

        const wfStatus = response.data?.workflow?.status;
        const statusLower = (wfStatus || "ok").toLowerCase();

        // Check if this is an active status or final status
        const isActive = /^(submitted|running|pending)$/i.test(statusLower);
        const statusShape = isActive ? "ring" : "dot";

        node.status({
          fill: mapColor(statusLower),
          shape: statusShape,
          text: `${statusLower}: ${formatDateTime()}`,
        });

        // Send to first output for active statuses, second for final statuses
        if (isActive) {
          send([msg, null]);
        } else {
          send([null, msg]);
        }

        if (done) done();
      } catch (err) {
        node.error(`Seqera API request failed: ${err.message}\nRequest: GET ${url}`, msg);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        return;
      }
    });
  }

  // Helper to map status to color
  function mapColor(stat) {
    const s = (stat || "").toLowerCase();
    if (/^(submitted|pending)$/.test(s)) return "yellow";
    if (/^(running)$/.test(s)) return "blue";
    if (/^(completed|succeeded|success)$/.test(s)) return "green";
    if (/^(failed|error)$/.test(s)) return "red";
    return "grey";
  }

  RED.nodes.registerType("seqera-workflow", SeqeraWorkflowNode, {
    credentials: {
      token: { type: "password" },
    },
    defaults: {
      name: { value: "" },
      seqeraConfig: { value: "", type: "seqera-config", required: true },
      workflowId: { value: "workflowId" },
      workflowIdType: { value: "msg" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "msg" },
    },
  });
};
