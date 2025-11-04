module.exports = function (RED) {
  function SeqeraDatasetCreateNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
    node.datasetNameProp = config.datasetName;
    node.datasetNamePropType = config.datasetNameType;
    node.fileContentsProp = config.fileContents;
    node.fileContentsPropType = config.fileContentsType;
    node.fileType = config.fileType || "csv";
    node.hasHeader = config.hasHeader;
    node.descriptionProp = config.description;
    node.descriptionPropType = config.descriptionType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;

    // Reference to the shared Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");
    const FormData = require("form-data");
    const { apiCall } = require("./_utils");

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

      const datasetName = await evalProp(node.datasetNameProp, node.datasetNamePropType);
      let fileContents = await evalProp(node.fileContentsProp, node.fileContentsPropType);
      const description = await evalProp(node.descriptionProp, node.descriptionPropType);
      const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
      const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);

      const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
      const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

      // Fallbacks
      if (fileContents === undefined || fileContents === null) {
        fileContents = msg.payload;
      }

      if (!datasetName) {
        const err = new Error([
          "datasetName not provided",
          datasetName,
          node.datasetNameProp,
          node.datasetNamePropType,
        ]);
        if (done) done(err);
        return;
      }
      if (!fileContents) {
        const err = new Error("fileContents not provided");
        if (done) done(err);
        return;
      }

      try {
        let apiStep = "create";
        node.status({ fill: "blue", shape: "ring", text: `creating: ${formatDateTime()}` });

        // 1) Create dataset
        let createUrl = `${baseUrl.replace(/\/$/, "")}/datasets`;
        if (workspaceId != null) createUrl += `?workspaceId=${workspaceId}`;

        const createBody = { name: datasetName };
        if (description != null && description !== "") createBody.description = description;

        const createResp = await apiCall(node, "post", createUrl, {
          headers: { "Content-Type": "application/json" },
          data: createBody,
        });
        const datasetId = createResp.data?.dataset?.id || createResp.data?.datasetId || createResp.data?.id || null;

        if (!datasetId) {
          const err = new Error("Dataset ID not returned");
          err.api_call = "create";
          throw err;
        }

        // 2) Upload file
        apiStep = "upload";
        node.status({ fill: "yellow", shape: "ring", text: `uploading: ${formatDateTime()}` });

        let uploadUrl = `${baseUrl.replace(/\/$/, "")}/datasets/${datasetId}/upload`;
        const queryParams = [];
        if (workspaceId != null) queryParams.push(`workspaceId=${workspaceId}`);
        if (node.hasHeader) queryParams.push(`header=true`);
        if (queryParams.length > 0) uploadUrl += `?${queryParams.join("&")}`;

        const form = new FormData();
        const buffer = Buffer.isBuffer(fileContents)
          ? fileContents
          : Buffer.from(typeof fileContents === "string" ? fileContents : JSON.stringify(fileContents));
        // Determine MIME type based on selected fileType
        const mime = node.fileType === "tsv" ? "text/tab-separated-values" : "text/csv";
        form.append("file", buffer, { filename: `${datasetName}.${node.fileType}`, contentType: mime });

        const uploadHeaders = form.getHeaders();
        const uploadResp = await apiCall(node, "post", uploadUrl, { headers: uploadHeaders, data: form });

        const outMsg = {
          ...msg,
          payload: uploadResp.data,
          datasetId: datasetId,
        };
        node.status({ fill: "green", shape: "dot", text: `uploaded: ${formatDateTime()}` });
        send(outMsg);
        if (done) done();
      } catch (err) {
        if (!err.api_call)
          err.api_call = err.config && err.config.url && /upload/.test(err.config.url) ? "upload" : "create";
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        node.error(err);
        return;
      }
    });
  }

  RED.nodes.registerType("seqera-dataset-create", SeqeraDatasetCreateNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      datasetName: { value: "datasetName" },
      datasetNameType: { value: "str" },
      fileContents: { value: "payload" },
      fileContentsType: { value: "msg" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "str" },
      description: { value: "description" },
      descriptionType: { value: "str" },
      baseUrl: { value: "baseUrl" },
      baseUrlType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
      fileType: { value: "csv" },
      hasHeader: { value: false },
    },
  });
};
