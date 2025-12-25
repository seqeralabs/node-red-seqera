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

    // Track multiple workflows: Map<workflowId, {intervalId, workspaceId, passthroughProps, send, pollMs}>
    // Note: We store only essential data to avoid memory leaks from large message payloads
    const activeWorkflows = new Map();

    const clearPolling = (workflowId) => {
      if (workflowId && activeWorkflows.has(workflowId)) {
        const workflow = activeWorkflows.get(workflowId);
        if (workflow.intervalId) {
          clearInterval(workflow.intervalId);
        }
        activeWorkflows.delete(workflowId);
      }
    };

    const clearAllPolling = () => {
      for (const [workflowId] of activeWorkflows) {
        clearPolling(workflowId);
      }
    };

    node.on("close", () => {
      clearAllPolling();
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

    // Helper to extract passthrough properties from message (excludes only payload to prevent memory leaks)
    // Standard Node-RED properties like topic, _msgid pass through
    // Output-specific properties like workflowId are explicitly set in output message
    const extractPassthroughProps = (msg) => {
      const { payload, ...passthrough } = msg;
      return passthrough;
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

    async function fetchStatus(workflowId) {
      // Get workflow from Map and store local reference to prevent edge cases during async operations
      const workflow = activeWorkflows.get(workflowId);
      if (!workflow) {
        return; // Workflow was cleared, stop polling
      }

      // Store local references to prevent issues if workflow is cleared during API call
      const { workspaceId, passthroughProps, send } = workflow;

      try {
        const baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const effectiveWorkspaceId = workspaceId || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

        const urlBase = `${baseUrl.replace(/\/$/, "")}/workflow/${workflowId}`;
        const url = effectiveWorkspaceId ? `${urlBase}?workspaceId=${effectiveWorkspaceId}` : urlBase;

        const response = await apiCall(node, "get", url, { headers: { Accept: "application/json" } });

        const wfStatus = response.data?.workflow?.status || "unknown";
        const statusLower = wfStatus.toLowerCase();

        // Update node status showing count of active workflows
        const activeCount = activeWorkflows.size;
        const statusText = activeCount > 1 ? `${activeCount} workflows (latest: ${statusLower})` : `${statusLower}`;

        node.status({
          fill: mapColor(statusLower),
          shape: /^(submitted|running)$/.test(statusLower) ? "ring" : "dot",
          text: `${statusText}: ${formatDateTime()}`,
        });

        const outMsg = {
          ...passthroughProps,
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

        // If keepPolling disabled OR workflow reached a final state, stop polling THIS workflow
        if (!node.keepPolling || !/^(submitted|running)$/.test(statusLower)) {
          clearPolling(workflowId);
          return;
        }
      } catch (err) {
        node.error(`Workflow ${workflowId}: ${err.message}`, { ...passthroughProps, workflowId });
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        clearPolling(workflowId);
      }
    }

    node.on("input", async function (msg, send, done) {
      let workflowId;
      try {
        // Evaluate workflowId from the incoming message
        workflowId = await evalProp(node.workflowIdProp, node.workflowIdPropType, msg);

        if (!workflowId) {
          throw new Error("workflowId not provided");
        }

        // If this workflow is already being monitored, clear its old interval
        if (activeWorkflows.has(workflowId)) {
          clearPolling(workflowId);
        }

        // Evaluate properties once at the start (they won't change during polling)
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType, msg);
        const pollInterval = await evalProp(node.pollIntervalProp, node.pollIntervalPropType, msg);
        const pollSec = parseInt(pollInterval, 10) || 5;
        const pollMs = pollSec * 1000;

        // Extract passthrough properties and store only essential data
        const passthroughProps = extractPassthroughProps(msg);

        // Store workflow tracking data (no full msg object to avoid memory leaks)
        const workflow = {
          intervalId: null,
          workspaceId: workspaceIdOverride || msg.workspaceId || null,
          passthroughProps: passthroughProps,
          send: send,
          pollMs: pollMs,
        };
        activeWorkflows.set(workflowId, workflow);

        // Kick off initial status fetch
        await fetchStatus(workflowId);

        // Start polling loop if enabled and workflow is still active (fetchStatus might have removed it)
        if (node.keepPolling && activeWorkflows.has(workflowId)) {
          const updatedWorkflow = activeWorkflows.get(workflowId);
          updatedWorkflow.intervalId = setInterval(() => fetchStatus(workflowId), pollMs);
          activeWorkflows.set(workflowId, updatedWorkflow);
        }

        if (done) done();
      } catch (err) {
        const wfId = workflowId || "unknown";
        node.error(`Workflow ${wfId}: ${err.message}`, msg);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        // Don't call done(err) to avoid double-done issue in tests
        if (done) done();
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
