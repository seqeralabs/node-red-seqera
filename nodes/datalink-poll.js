module.exports = function (RED) {
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

    // Poll-specific property (legacy minutes value retained for backward compatibility)
    // This will be overridden by the new seconds-based duration parser below.

    // Poll-specific property (seconds)
    const parseDurationToSeconds = (value) => {
      if (typeof value === "number") return value;
      if (typeof value !== "string") return NaN;
      const v = value.trim();
      let m;
      // DD-HH:MM:SS
      if ((m = v.match(/^(\d+)-(\d{1,2}):(\d{1,2}):(\d{1,2})$/))) {
        const [, dd, hh, mm, ss] = m.map(Number);
        return dd * 86400 + hh * 3600 + mm * 60 + ss;
      }
      // HH:MM:SS
      if ((m = v.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/))) {
        const [, hh, mm, ss] = m.map(Number);
        return hh * 3600 + mm * 60 + ss;
      }
      // MM:SS
      if ((m = v.match(/^(\d{1,2}):(\d{1,2})$/))) {
        const [, mm, ss] = m.map(Number);
        return mm * 60 + ss;
      }
      // SS
      if (/^\d+$/.test(v)) {
        return parseInt(v, 10);
      }
      return NaN;
    };

    // Poll-specific property (seconds)
    const pollSecs = parseDurationToSeconds(config.pollFrequency);
    node.pollFrequencySec = !pollSecs || Number.isNaN(pollSecs) ? 15 * 60 : pollSecs;

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
          },
          files: result.files.map((it) => `${result.resourceRef}/${it}`),
        };

        // Second output: only new items since previous poll
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

        // Update cache
        previousNamesSet = new Set(result.items.map((it) => it.name));

        node.status({ fill: "green", shape: "dot", text: `${result.items.length} items: ${formatDateTime()}` });
        node.send([msgAll, msgNew]);
      } catch (err) {
        node.error(`Seqera datalink poll failed: ${err.message}`);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
      }
    };

    // Start the polling interval immediately
    const intervalMs = node.pollFrequencySec * 1000;
    const intervalId = setInterval(executePoll, intervalMs);
    // run once immediately
    executePoll();

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
      pollFrequency: { value: "15:00" },
    },
  });
};
