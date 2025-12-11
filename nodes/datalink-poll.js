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

    // Helper to create unique identifier for a file based on name + metadata
    // This ensures files with same name but different timestamps/size/etag are detected as new
    const getFileIdentifier = (item) => {
      const parts = [item.name];
      if (item.lastModified) parts.push(item.lastModified);
      if (item.size != null) parts.push(String(item.size));
      if (item.etag) parts.push(item.etag);
      return parts.join("|");
    };

    // Internal cache of previously seen objects
    // Store both identifiers (for change detection) and a map by name (for deletion detection)
    let previousIdentifiersSet = null;
    let previousItemsMap = null;
    let intervalId = null;

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
          },
          files: result.files.map((it) => `${result.resourceRef}/${it}`),
        };

        // Build current state for comparison
        const currentIdentifiers = new Set(result.items.map(getFileIdentifier));
        const currentNameToItem = new Map(result.items.map((it) => [it.name, it]));

        // Second output: new or modified items since previous poll
        let msgNew = null;
        if (previousIdentifiersSet) {
          const newOrModified = result.items.filter((it) => !previousIdentifiersSet.has(getFileIdentifier(it)));
          if (newOrModified.length) {
            msgNew = {
              ...pollMsg,
              payload: {
                files: newOrModified,
                resourceType: result.resourceType,
                resourceRef: result.resourceRef,
                provider: result.provider,
              },
              files: newOrModified.map((it) => `${result.resourceRef}/${it.name}`),
            };
          }
        }

        // Third output: deleted items (present in previous poll but not current)
        let msgDeleted = null;
        if (previousItemsMap) {
          const deletedItems = [];
          for (const [name, item] of previousItemsMap.entries()) {
            if (!currentNameToItem.has(name)) {
              deletedItems.push(item);
            }
          }
          if (deletedItems.length) {
            msgDeleted = {
              ...pollMsg,
              payload: {
                files: deletedItems,
                resourceType: result.resourceType,
                resourceRef: result.resourceRef,
                provider: result.provider,
              },
              files: deletedItems.map((it) => `${result.resourceRef}/${it.name}`),
            };
          }
        }

        // Update cache
        previousIdentifiersSet = currentIdentifiers;
        previousItemsMap = currentNameToItem;

        node.status({ fill: "green", shape: "dot", text: `${result.items.length} items: ${formatDateTime()}` });
        node.send([msgAll, msgNew, msgDeleted]);
      } catch (err) {
        node.error(`Seqera datalink poll failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
      }
    };

    // Start the polling interval
    if (node.seqeraConfig && config.dataLinkName && config.dataLinkName.trim() !== "") {
      const intervalMs = node.pollFrequencySec * 1000;
      intervalId = setInterval(executePoll, intervalMs);
      // run once immediately
      executePoll();
    }

    node.on("close", () => {
      clearInterval(intervalId);
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
