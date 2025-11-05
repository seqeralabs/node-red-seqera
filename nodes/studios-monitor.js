module.exports = function (RED) {
  function SeqeraStudiosMonitorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // --- Store typedInput properties
    node.studioIdProp = config.studioId;
    node.studioIdPropType = config.studioIdType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.pollIntervalProp = config.poll;
    node.pollUnitsProp = config.pollUnits;
    node.keepPolling = config.keepPolling !== false; // default true

    // Shared Seqera config
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    // Legacy per-node credentials support
    node.credentials = RED.nodes.getCredentials(node.id);

    const { apiCall } = require("./_utils");

    // Format time helper
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    let intervalId = null;
    let previousStatus = null; // Track previous status to detect transitions

    const clearPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    node.on("close", clearPolling);

    // Evaluate typedInput helper (supports JSONata)
    const evalProp = async (p, t, msg) => {
      if (t === "jsonata") {
        const expr = RED.util.prepareJSONataExpression(p, node);
        return new Promise((resolve, reject) => {
          RED.util.evaluateJSONataExpression(expr, msg, (err, v) => {
            if (err) return reject(err);
            resolve(v);
          });
        });
      }
      return RED.util.evaluateNodeProperty(p, t, node, msg);
    };

    // Helper to convert poll interval to seconds based on units
    const convertToSeconds = (val, unit) => {
      const num = parseInt(val, 10) || 5;
      if (unit === "minutes") return num * 60;
      if (unit === "hours") return num * 3600;
      return num; // seconds or default
    };

    // Status-colour mapping
    const mapColor = (s) => {
      const stat = (s || "").toLowerCase().replace(/\s+/g, ""); // normalize "build failed" -> "buildfailed"
      if (/^(starting|building)$/.test(stat)) return "yellow";
      if (/^(running)$/.test(stat)) return "blue";
      if (/^(stopping|stopped)$/.test(stat)) return "grey";
      if (/^(errored|buildfailed)$/.test(stat)) return "red";
      return "grey"; // unknown
    };

    async function fetchStatus(msg, send) {
      try {
        // Evaluate dynamic props each poll so they can change via msg
        const studioId = await evalProp(node.studioIdProp, node.studioIdPropType, msg);
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType, msg);

        if (!studioId) throw new Error("studioId not provided");

        const baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const workspaceId =
          workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || msg.workspaceId || null;

        const urlBase = `${baseUrl.replace(/\/$/, "")}/studios/${studioId}`;
        const url = workspaceId ? `${urlBase}?workspaceId=${workspaceId}` : urlBase;

        const response = await apiCall(node, "get", url, { headers: { Accept: "application/json" } });
        const studioStatus = response.data?.statusInfo?.status || "unknown";
        const statusLower = studioStatus.toLowerCase();

        const statusNormalized = statusLower.replace(/\s+/g, ""); // normalize "build failed" -> "buildfailed"

        node.status({
          fill: mapColor(statusLower),
          shape: /^(starting|running|building|stopping)$/.test(statusNormalized) ? "ring" : "dot",
          text: `${statusLower}: ${formatDateTime()}`,
        });

        const outMsg = {
          ...msg,
          payload: response.data,
          studioId: response.data?.sessionId || studioId,
        };

        // Output 1: Always send on every check
        // Output 2: Send only on transition to running (ready to use) - not on every poll while running
        // Output 3: Send when studio is no longer running (stopped, errored, buildfailed)
        const isRunning = /^(running)$/.test(statusNormalized);
        const isTerminated = /^(stopped|errored|buildfailed)$/.test(statusNormalized);
        const previousNormalized = (previousStatus || "").replace(/\s+/g, "");
        const justBecameRunning = isRunning && previousNormalized !== "running";

        send([outMsg, justBecameRunning ? outMsg : null, isTerminated ? outMsg : null]);

        // Update previous status for next poll
        previousStatus = statusLower;

        // Determine if we should continue polling (stop when terminated)
        if (!node.keepPolling || isTerminated) {
          clearPolling();
        }

        // Adjust poll interval dynamically if value changed
        if (node.keepPolling && /^(starting|running|building|stopping)$/.test(statusNormalized)) {
          const pollSec = convertToSeconds(node.pollIntervalProp, node.pollUnitsProp);
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
      previousStatus = null; // Reset status tracking on new input
      try {
        await fetchStatus(msg, send);

        if (node.keepPolling && !intervalId) {
          const pollSec = convertToSeconds(node.pollIntervalProp, node.pollUnitsProp);
          node._currentPollMs = pollSec * 1000;
          intervalId = setInterval(() => fetchStatus(msg, send), node._currentPollMs);
        }
        if (done) done();
      } catch (err) {
        if (done) done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-studios-monitor", SeqeraStudiosMonitorNode, {
    credentials: {
      token: { type: "password" },
    },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config" },
      studioId: { value: "studioId" },
      studioIdType: { value: "msg" },
      workspaceId: { value: "" },
      workspaceIdType: { value: "str" },
      keepPolling: { value: true },
      poll: { value: 5 },
      pollUnits: { value: "seconds" },
    },
  });
};
