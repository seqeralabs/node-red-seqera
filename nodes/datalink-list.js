// New node implementation for seqera-datalink-list
module.exports = function (RED) {
  function SeqeraDatalinkListNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
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

    // Reference Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const datalinkUtils = require("./datalink-utils");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      node.status({ fill: "blue", shape: "ring", text: `listing: ${formatDateTime()}` });

      try {
        const result = await datalinkUtils.listDataLink(RED, node, msg);
        msg.payload = {
          files: result.items,
          resourceType: result.resourceType,
          resourceRef: result.resourceRef,
          provider: result.provider,
        };
        msg.files = result.files.map((it) => `${result.resourceRef}/${it}`);
        node.status({ fill: "green", shape: "dot", text: `${result.items.length} items: ${formatDateTime()}` });
        send(msg);
        if (done) done();
      } catch (err) {
        node.error(`Seqera datalink list failed: ${err.message}`, msg);
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        return;
      }
    });
  }

  RED.nodes.registerType("seqera-datalink-list", SeqeraDatalinkListNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
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
    },
  });
};
