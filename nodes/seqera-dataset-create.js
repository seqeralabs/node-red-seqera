module.exports = function (RED) {
  function SeqeraDatasetCreateNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
    node.datasetNameProp = config.datasetName;
    node.datasetNamePropType = config.datasetNameType;
    node.fileContentsProp = config.fileContents;
    node.fileContentsPropType = config.fileContentsType;
    node.descriptionProp = config.description;
    node.descriptionPropType = config.descriptionType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.tokenProp = config.token;
    node.tokenPropType = config.tokenType;

    // Reference to the shared Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");
    const FormData = require("form-data");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      // evaluate properties
      const evalProp = (p, t) => RED.util.evaluateNodeProperty(p, t, node, msg, () => {});

      const datasetName = evalProp(node.datasetNameProp, node.datasetNamePropType);
      let fileContents = evalProp(node.fileContentsProp, node.fileContentsPropType);
      const description = evalProp(node.descriptionProp, node.descriptionPropType);
      const baseUrlOverride = evalProp(node.baseUrlProp, node.baseUrlPropType);
      const workspaceIdOverride = evalProp(node.workspaceIdProp, node.workspaceIdPropType);
      const tokenOverride = evalProp(node.tokenProp, node.tokenPropType);

      const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
      const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;

      // Fallbacks
      if (fileContents === undefined || fileContents === null) {
        fileContents = msg.payload;
      }

      if (!datasetName) {
        const err = new Error("datasetName not provided");
        if (done) done(err);
        return;
      }
      if (!fileContents) {
        const err = new Error("fileContents not provided");
        if (done) done(err);
        return;
      }

      // Helper: build headers with auth token + additional
      const buildHeaders = (extra = {}) => {
        const headers = { ...extra };
        const token =
          tokenOverride ||
          (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
          (node.credentials && node.credentials.token);
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return headers;
      };

      try {
        node.status({ fill: "blue", shape: "ring", text: `creating: ${formatDateTime()}` });

        // 1) Create dataset
        let createUrl = `${baseUrl.replace(/\/$/, "")}/datasets`;
        if (workspaceId != null) createUrl += `?workspaceId=${workspaceId}`;

        const createBody = { name: datasetName };
        if (description != null && description !== "") createBody.description = description;

        const createHeaders = buildHeaders({ "Content-Type": "application/json" });
        msg._seqera_request = { method: "POST", url: createUrl, headers: createHeaders, body: createBody };

        const createResp = await axios.post(createUrl, createBody, { headers: createHeaders });
        const datasetId = createResp.data?.dataset?.id || createResp.data?.datasetId || createResp.data?.id || null;

        if (!datasetId) {
          const err = new Error("Dataset ID not returned");
          err.api_call = "create";
          throw err;
        }

        // 2) Upload file
        node.status({ fill: "yellow", shape: "ring", text: `uploading: ${formatDateTime()}` });

        let uploadUrl = `${baseUrl.replace(/\/$/, "")}/datasets/${datasetId}/upload`;
        if (workspaceId != null) uploadUrl += `?workspaceId=${workspaceId}`;

        const form = new FormData();
        const buffer = Buffer.isBuffer(fileContents)
          ? fileContents
          : Buffer.from(typeof fileContents === "string" ? fileContents : JSON.stringify(fileContents));
        form.append("file", buffer, { filename: `${datasetName}.csv`, contentType: "text/plain" });

        const uploadHeaders = buildHeaders(form.getHeaders());
        msg._seqera_upload_request = { method: "POST", url: uploadUrl, headers: uploadHeaders };

        const uploadResp = await axios.post(uploadUrl, form, { headers: uploadHeaders });

        msg.payload = uploadResp.data;
        msg.datasetId = datasetId;
        node.status({ fill: "green", shape: "dot", text: `uploaded: ${formatDateTime()}` });
        send(msg);
        if (done) done();
      } catch (err) {
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        if (done) done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-dataset-create", SeqeraDatasetCreateNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      datasetName: { value: "" },
      datasetNameType: { value: "str" },
      fileContents: { value: "payload" },
      fileContentsType: { value: "msg" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "str" },
      description: { value: "" },
      descriptionType: { value: "str" },
      baseUrl: { value: "baseUrl" },
      baseUrlType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
    },
  });
};
