module.exports = function (RED) {
  function SeqeraWorkflowMonitorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput and config properties
    node.workflowIdProp = config.workflowId;
    node.workflowIdPropType = config.workflowIdType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.pollIntervalProp = config.poll;
    node.pollIntervalPropType = config.pollType;
    node.keepPolling = config.keepPolling !== false; // default to true if undefined

    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    // Local (deprecated) credentials – still supported for parity with other nodes
    node.credentials = RED.nodes.getCredentials(node.id);

    const { apiCall } = require("./_utils");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    let intervalId = null;

    const clearPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    node.on("close", () => {
      clearPolling();
    });

    // Helper to evaluate typedInput properties (supports JSONata)
    const evalProp = async (p, t, msg) => {
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

    // Helper to map workflow status to Node-RED colour
    const mapColor = (stat) => {
      const s = (stat || "").toLowerCase();
      if (/^(submitted)$/.test(s)) return "yellow";
      if (/^(running)$/.test(s)) return "blue";
      if (/^(succeeded)$/.test(s)) return "green";
      if (/^(failed)$/.test(s)) return "red";
      return "grey"; // cancelled, unknown
    };

    async function fetchStatus(msg, send) {
      try {
        // Evaluate properties on every poll so that msg overrides can change
        const workflowId = await evalProp(node.workflowIdProp, node.workflowIdPropType, msg);
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType, msg);
        const pollInterval = await evalProp(node.pollIntervalProp, node.pollIntervalPropType, msg);

        if (!workflowId) {
          throw new Error("workflowId not provided");
        }

        const baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const workspaceId =
          workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || msg.workspaceId || null;

        const urlBase = `${baseUrl.replace(/\/$/, "")}/workflow/${workflowId}`;
        const url = workspaceId ? `${urlBase}?workspaceId=${workspaceId}` : urlBase;

        const response = await apiCall(node, "get", url, { headers: { Accept: "application/json" } });

        const wfStatus = response.data?.workflow?.status || "unknown";
        const statusLower = wfStatus.toLowerCase();

        // Set node status in editor
        node.status({
          fill: mapColor(statusLower),
          shape: /^(submitted|running)$/.test(statusLower) ? "ring" : "dot",
          text: `${statusLower}: ${formatDateTime()}`,
        });

        const outMsg = {
          ...msg,
          payload: response.data,
          workflowId: response.data?.workflow?.id || workflowId,
        };

        // Decide which output to send to
        // Output 1: Active (submitted, running)
        // Output 2: Succeeded
        // Output 3: Failed/Cancelled/Unknown
        if (/^(submitted|running)$/.test(statusLower)) {
          send([outMsg, null, null]);
        } else if (/^(succeeded)$/.test(statusLower)) {
          send([null, outMsg, null]);
        } else {
          // failed, cancelled, unknown
          send([null, null, outMsg]);
        }

        // If keepPolling disabled OR workflow reached a final state, stop polling
        if (!node.keepPolling || !/^(submitted|running)$/.test(statusLower)) {
          clearPolling();
        }

        // Update polling interval if changed dynamically
        if (node.keepPolling && /^(submitted|running)$/.test(statusLower)) {
          const pollSec = parseInt(pollInterval, 10) || 5;
          if (pollSec * 1000 !== node._currentPollMs) {
            clearPolling();
            node._currentPollMs = pollSec * 1000;
            intervalId = setInterval(() => fetchStatus(msg, send), node._currentPollMs);
          }
        }
      } catch (err) {
        node.error(`Seqera API request failed: ${err.message}`, msg);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        clearPolling();
      }
    }

    node.on("input", async function (msg, send, done) {
      clearPolling();

      try {
        // Kick off status fetch (will set up interval if needed)
        await fetchStatus(msg, send);

        // Start polling loop if enabled and interval not yet set
        if (node.keepPolling && !intervalId) {
          const pollInterval = await evalProp(node.pollIntervalProp, node.pollIntervalPropType, msg);
          const pollSec = parseInt(pollInterval, 10) || 5;
          node._currentPollMs = pollSec * 1000;
          intervalId = setInterval(() => fetchStatus(msg, send), node._currentPollMs);
        }

        if (done) done();
      } catch (err) {
        if (done) done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-workflow-monitor", SeqeraWorkflowMonitorNode, {
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
      keepPolling: { value: true },
      poll: { value: 5 },
      pollType: { value: "num" },
    },
  });
};
