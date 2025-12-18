module.exports = function (RED) {
  const { handleDatalinkAutoComplete } = require("./_utils");

  // Add HTTP endpoint for datalink auto-complete
  RED.httpAdmin.get("/admin/seqera/datalinks/:nodeId", (req, res) => {
    handleDatalinkAutoComplete(RED, req, res);
  });

  const datalinkUtils = require("./datalink-utils");

  function SeqeraDatalinkPollNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // ---- Store typedInput properties (mirrors datalink-list) ----
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
    node.depthProp = config.depth;
    node.depthPropType = config.depthType;
    node.returnType = config.returnType || "files"; // files|folders|all
    node.outputAllPolls = config.outputAllPolls || false;

    // Poll frequency configuration
    const unitMultipliers = {
      seconds: 1,
      minutes: 60,
      hours: 3600,
      days: 86400,
    };
    const pollValue = parseInt(config.pollFrequency, 10) || 15;
    const pollUnits = config.pollUnits || "minutes";
    node.pollFrequencySec = pollValue * (unitMultipliers[pollUnits] || 60);

    // Reference config node & defaults
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    // Helper to format date-time for status
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    // Internal cache of previously seen object names
    let previousNamesSet = null;

    // Polling function
    const executePoll = async () => {
      const pollMsg = {};
      node.status({ fill: "blue", shape: "ring", text: `polling: ${formatDateTime()}` });

      try {
        const result = await datalinkUtils.listDataLink(RED, node, pollMsg);

        // First output: all items every poll
        const msgAll = {
          ...pollMsg,
          payload: {
            files: result.items,
            resourceType: result.resourceType,
            resourceRef: result.resourceRef,
            provider: result.provider,
            nextPoll: new Date(Date.now() + node.pollFrequencySec * 1000).toISOString(),
            pollIntervalSeconds: node.pollFrequencySec,
          },
          files: result.files.map((it) => `${result.resourceRef}/${it}`),
        };

        // Build set of current names for comparison
        const currentNamesSet = new Set(result.items.map((it) => it.name));

        // New items since previous poll
        let msgNew = null;
        if (previousNamesSet) {
          const newItems = result.items.filter((it) => !previousNamesSet.has(it.name));
          if (newItems.length) {
            msgNew = {
              payload: {
                files: newItems,
                resourceType: result.resourceType,
                resourceRef: result.resourceRef,
                provider: result.provider,
              },
              files: newItems.map((it) => `${result.resourceRef}/${it.name}`),
            };
          }
        }

        // Deleted items since previous poll
        let msgDeleted = null;
        if (previousNamesSet) {
          const deletedNames = [...previousNamesSet].filter((name) => !currentNamesSet.has(name));
          if (deletedNames.length) {
            msgDeleted = {
              payload: {
                files: deletedNames.map((name) => ({ name })),
                resourceType: result.resourceType,
                resourceRef: result.resourceRef,
                provider: result.provider,
              },
              files: deletedNames.map((name) => `${result.resourceRef}/${name}`),
            };
          }
        }

        // Update cache
        previousNamesSet = currentNamesSet;

        node.status({ fill: "green", shape: "dot", text: `${result.items.length} items: ${formatDateTime()}` });

        // Send to outputs based on configuration
        if (node.outputAllPolls) {
          // Three outputs: [All results, New results, Deleted results]
          node.send([msgAll, msgNew, msgDeleted]);
        } else {
          // Two outputs: [New results, Deleted results]
          node.send([msgNew, msgDeleted]);
        }
      } catch (err) {
        node.error(`Seqera datalink poll failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
      }
    };

    // Start the polling interval
    let intervalId = null;
    if (node.seqeraConfig && config.dataLinkName && config.dataLinkName.trim() !== "") {
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

  RED.nodes.registerType("seqera-datalink-poll", SeqeraDatalinkPollNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      // shared
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
      returnType: { value: "files" },
      // poll specific
      pollFrequency: { value: "15" },
    },
  });
};
