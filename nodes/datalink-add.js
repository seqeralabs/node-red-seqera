module.exports = function (RED) {
  function SeqeraDatalinkAddNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
    node.dataLinkNameProp = config.dataLinkName;
    node.dataLinkNamePropType = config.dataLinkNameType;
    node.descriptionProp = config.description;
    node.descriptionPropType = config.descriptionType;
    node.resourceRefProp = config.resourceRef;
    node.resourceRefPropType = config.resourceRefType;
    node.providerProp = config.provider;
    node.providerPropType = config.providerType;
    node.credentialsNameProp = config.credentialsName;
    node.credentialsNamePropType = config.credentialsNameType;
    node.resourceType = config.resourceType || "bucket";
    node.publicAccessible = config.publicAccessible !== undefined ? config.publicAccessible : false;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;

    // Reference to the shared Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const { apiCall } = require("./_utils");
    const { resolveCredentials } = require("./datalink-utils");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      // evaluate properties
      const evalProp = async (p, t) => {
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

      const dataLinkName = await evalProp(node.dataLinkNameProp, node.dataLinkNamePropType);
      const description = await evalProp(node.descriptionProp, node.descriptionPropType);
      const resourceRef = await evalProp(node.resourceRefProp, node.resourceRefPropType);
      const provider = await evalProp(node.providerProp, node.providerPropType);
      const credentialsName = await evalProp(node.credentialsNameProp, node.credentialsNamePropType);
      const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
      const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);

      const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
      const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

      // Validate required fields
      if (!dataLinkName) {
        const err = new Error("dataLinkName not provided");
        if (done) done(err);
        else node.error(err, msg);
        return;
      }
      if (!resourceRef) {
        const err = new Error("resourceRef not provided");
        if (done) done(err);
        else node.error(err, msg);
        return;
      }
      if (!provider) {
        const err = new Error("provider not provided");
        if (done) done(err);
        else node.error(err, msg);
        return;
      }

      try {
        node.status({ fill: "blue", shape: "ring", text: `creating: ${formatDateTime()}` });

        // Resolve credentials name to ID if provided
        let credentialsId = null;
        if (credentialsName && credentialsName.trim() !== "") {
          node.status({ fill: "yellow", shape: "ring", text: `resolving credentials: ${formatDateTime()}` });
          credentialsId = await resolveCredentials(RED, node, msg, credentialsName, {
            baseUrl,
            workspaceId,
          });
        }

        // Build the request body
        const createBody = {
          name: dataLinkName,
          resourceRef: resourceRef,
          provider: provider,
          type: node.resourceType,
          publicAccessible: String(node.publicAccessible),
        };

        // Add optional fields
        if (description != null && description !== "") {
          createBody.description = description;
        }
        if (credentialsId != null) {
          createBody.credentialsId = credentialsId;
        }

        // Build the URL with workspace ID
        let createUrl = `${baseUrl.replace(/\/$/, "")}/data-links`;
        if (workspaceId != null) createUrl += `?workspaceId=${workspaceId}`;

        // Make the API call
        const createResp = await apiCall(node, "post", createUrl, {
          headers: { "Content-Type": "application/json" },
          data: createBody,
        });

        const dataLinkId = createResp.data?.dataLink?.id || createResp.data?.id || null;

        const outMsg = {
          ...msg,
          payload: createResp.data,
          dataLinkId: dataLinkId,
          dataLinkName: dataLinkName,
        };
        node.status({ fill: "green", shape: "dot", text: `created: ${formatDateTime()}` });
        send(outMsg);
        if (done) done();
      } catch (err) {
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        node.error(`Seqera data-link create failed: ${err.message}`, msg);
        if (done) done(err);
        return;
      }
    });
  }

  RED.nodes.registerType("seqera-datalink-add", SeqeraDatalinkAddNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      dataLinkName: { value: "", required: true },
      dataLinkNameType: { value: "str" },
      description: { value: "" },
      descriptionType: { value: "str" },
      resourceRef: { value: "", required: true },
      resourceRefType: { value: "str" },
      provider: { value: "aws", required: true },
      providerType: { value: "str" },
      credentialsName: { value: "" },
      credentialsNameType: { value: "str" },
      resourceType: { value: "bucket" },
      publicAccessible: { value: false },
      workspaceId: { value: "" },
      workspaceIdType: { value: "str" },
      baseUrl: { value: "" },
      baseUrlType: { value: "str" },
      token: { value: "" },
      tokenType: { value: "str" },
    },
  });
};
