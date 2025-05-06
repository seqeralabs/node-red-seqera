module.exports = function (RED) {
  function SeqeraLaunchNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Save typedInput property configs
    node.launchpadNameProp = config.launchpadName;
    node.launchpadNamePropType = config.launchpadNameType;
    node.paramsProp = config.paramsKey;
    node.paramsPropType = config.paramsKeyType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.sourceWorkspaceIdProp = config.sourceWorkspaceId;
    node.sourceWorkspaceIdPropType = config.sourceWorkspaceIdType;
    node.tokenProp = config.token;
    node.tokenPropType = config.tokenType;

    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      node.status({ fill: "blue", shape: "ring", text: `launching: ${formatDateTime()}` });

      // Helper to evaluate properties
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

      const launchpadName = await evalProp(node.launchpadNameProp, node.launchpadNamePropType);
      const paramsObj = await evalProp(node.paramsProp, node.paramsPropType);
      const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
      const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);
      const sourceWorkspaceIdOverride = await evalProp(node.sourceWorkspaceIdProp, node.sourceWorkspaceIdPropType);
      const tokenOverride = await evalProp(node.tokenProp, node.tokenPropType);

      const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
      const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;
      const sourceWorkspaceId = sourceWorkspaceIdOverride || null;

      let body = msg.body || msg.payload;

      if (launchpadName) {
        try {
          const pipelinesUrl = `${baseUrl.replace(
            /\/$/,
            "",
          )}/pipelines?workspaceId=${workspaceId}&max=50&offset=0&search=${encodeURIComponent(
            launchpadName,
          )}&visibility=all`;
          const headersGet = { Accept: "application/json" };
          const token =
            tokenOverride ||
            (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
            (node.credentials && node.credentials.token);
          if (token) headersGet["Authorization"] = `Bearer ${token}`;

          const pipelinesResp = await axios.get(pipelinesUrl, { headers: headersGet });
          const pipelines = pipelinesResp.data?.pipelines || [];
          const match = pipelines.find((p) => p.name === launchpadName) || pipelines[0];
          if (!match) throw new Error(`No pipeline found for launchpadName '${launchpadName}'`);

          const launchCfgUrl = `${baseUrl.replace(/\/$/, "")}/pipelines/${
            match.pipelineId
          }/launch?workspaceId=${workspaceId}`;
          const launchResp = await axios.get(launchCfgUrl, { headers: headersGet });
          if (!launchResp.data || !launchResp.data.launch) throw new Error("Invalid launch config response");

          const lp = { ...launchResp.data.launch };
          if (lp.computeEnv?.id) {
            lp.computeEnvId = lp.computeEnv.id;
            delete lp.computeEnv;
          }
          body = { launch: lp };
        } catch (errFetch) {
          node.error(`Failed to resolve launchpad name '${launchpadName}': ${errFetch.message}`, msg);
          msg._seqera_error = errFetch;
          send(msg);
          if (done) done(errFetch);
          return;
        }
      }

      if (!body) {
        done(
          new Error(
            "No request body supplied (and no launchpadName resolved). Provide JSON payload or configure launchpadName.",
          ),
        );
        return;
      }

      // Merge paramsObj into launch.paramsText
      if (paramsObj && typeof paramsObj === "object") {
        body.launch = body.launch || {};
        let existingParams = {};
        if (body.launch.paramsText) {
          try {
            existingParams = JSON.parse(body.launch.paramsText);
          } catch (_) {}
        }
        body.launch.paramsText = JSON.stringify({ ...existingParams, ...paramsObj });
      }

      // Build URL with query params
      let url = `${baseUrl.replace(/\/$/, "")}/workflow/launch`;
      const qs = new URLSearchParams();
      if (workspaceId != null) qs.append("workspaceId", workspaceId);
      if (sourceWorkspaceId != null) qs.append("sourceWorkspaceId", sourceWorkspaceId);
      if (qs.toString()) url += `?${qs.toString()}`;

      // Headers
      const headers = { "Content-Type": "application/json" };
      const tokenHeader =
        tokenOverride ||
        (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
        (node.credentials && node.credentials.token);
      if (tokenHeader) headers["Authorization"] = `Bearer ${tokenHeader}`;

      msg._seqera_request = { method: "POST", url, headers, body };

      try {
        const response = await axios.post(url, body, { headers });
        msg.payload = response.data;
        msg.workflowId = response.data?.workflowId || response.data?.workflow?.id;
        node.status({ fill: "green", shape: "dot", text: `launched: ${formatDateTime()}` });
        send(msg);
        if (done) done();
      } catch (err) {
        msg._seqera_error = err.response
          ? { status: err.response.status, data: err.response.data }
          : { message: err.message };
        node.error(`Seqera API request failed: ${err.message}\nRequest: POST ${url}`, msg);
        node.status({ fill: "red", shape: "ring", text: `error: ${formatDateTime()}` });
        send(msg);
        if (done) done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-launch", SeqeraLaunchNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqeraConfig: { value: "", type: "seqera-config", required: true },
      workflowId: { value: "workflowId" },
      workflowIdType: { value: "str" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "str" },
      params: { value: "{}" },
      paramsType: { value: "json" },
      launchpadName: { value: "launchpadName" },
      launchpadNameType: { value: "str" },
      paramsKey: { value: "params" },
      paramsKeyType: { value: "str" },
      baseUrl: { value: "baseUrl" },
      baseUrlType: { value: "str" },
      sourceWorkspaceId: { value: "sourceWorkspaceId" },
      sourceWorkspaceIdType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
    },
  });
};
