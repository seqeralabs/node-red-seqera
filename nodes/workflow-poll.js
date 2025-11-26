module.exports = function (RED) {
  function SeqeraWorkflowPollNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
    node.searchProp = config.search;
    node.searchPropType = config.searchType;
    node.maxResultsProp = config.maxResults;
    node.maxResultsPropType = config.maxResultsType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;

    // Poll frequency configuration
    const unitMultipliers = {
      seconds: 1,
      minutes: 60,
      hours: 3600,
      days: 86400,
    };
    const pollValue = parseInt(config.pollFrequency, 10) || 1;
    const pollUnits = config.pollUnits || "minutes";
    node.pollFrequencySec = pollValue * (unitMultipliers[pollUnits] || 60);

    // Reference config node & defaults
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    const { apiCall } = require("./_utils");

    // Helper to format date-time for status
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

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

    // Internal cache of previously seen workflow IDs
    let previousIdsSet = null;

    // Polling function
    const executePoll = async () => {
      const pollMsg = {};
      node.status({ fill: "blue", shape: "ring", text: `polling: ${formatDateTime()}` });

      try {
        // Evaluate properties
        const search = await evalProp(node.searchProp, node.searchPropType, pollMsg);
        const maxResults = await evalProp(node.maxResultsProp, node.maxResultsPropType, pollMsg);
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType, pollMsg);

        const baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

        if (!workspaceId) {
          throw new Error("Workspace ID not provided");
        }

        // Build API URL
        const params = new URLSearchParams({
          attributes: "minimal",
          workspaceId: workspaceId,
          max: maxResults || 50,
        });
        if (search && search.trim()) {
          params.append("search", search.trim());
        }

        const workflowsUrl = `${baseUrl.replace(/\/$/, "")}/workflow?${params.toString()}`;

        const response = await apiCall(node, "get", workflowsUrl, {
          headers: { Accept: "application/json" },
        });

        const workflows = response.data?.workflows || [];

        // First output: all workflows every poll
        const msgAll = {
          ...pollMsg,
          payload: {
            workflows: workflows,
            nextPoll: new Date(Date.now() + node.pollFrequencySec * 1000).toISOString(),
          },
          workflowIds: workflows.map((w) => w.workflow.id),
        };

        // Second output: only new workflows since previous poll (one message per workflow)
        const newWorkflows = [];
        if (previousIdsSet) {
          for (const w of workflows) {
            if (!previousIdsSet.has(w.workflow.id)) {
              newWorkflows.push(w);
            }
          }
        }

        // Update cache
        previousIdsSet = new Set(workflows.map((w) => w.workflow.id));

        node.status({ fill: "green", shape: "dot", text: `${formatDateTime()}` });

        // Send output 1 (all results)
        node.send([msgAll, null]);

        // Send output 2 (one message per new workflow)
        for (const workflow of newWorkflows) {
          const msgNew = {
            payload: {
              workflow: workflow,
            },
            workflowId: workflow.workflow.id,
          };
          node.send([null, msgNew]);
        }
      } catch (err) {
        node.error(`Seqera workflow poll failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
      }
    };

    // Start the polling interval
    let intervalId = null;
    if (node.seqeraConfig) {
      const intervalMs = node.pollFrequencySec * 1000;
      intervalId = setInterval(executePoll, intervalMs);
      // run once immediately
      executePoll();
    }

    node.on("close", () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    });
  }

  RED.nodes.registerType("seqera-workflow-poll", SeqeraWorkflowPollNode, {
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      search: { value: "" },
      searchType: { value: "str" },
      maxResults: { value: "50" },
      maxResultsType: { value: "num" },
      workspaceId: { value: "" },
      workspaceIdType: { value: "str" },
      pollFrequency: { value: "1" },
      pollUnits: { value: "minutes" },
    },
  });
};
