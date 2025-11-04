module.exports = function (RED) {
  // Add HTTP endpoint for pipeline auto-complete
  RED.httpAdmin.get("/admin/seqera/pipelines/:nodeId", async function (req, res) {
    try {
      const nodeId = req.params.nodeId;
      const search = req.query.search || "";

      // Try to get the node, but it might not exist yet if this is a new node
      let node = RED.nodes.getNode(nodeId);
      let seqeraConfigId = null;
      let baseUrl = "https://api.cloud.seqera.io";
      let workspaceId = null;

      if (node && node.seqeraConfig) {
        // Node exists and has config
        seqeraConfigId = node.seqeraConfig.id;
        baseUrl = node.seqeraConfig.baseUrl || baseUrl;
        workspaceId = node.seqeraConfig.workspaceId;

        // Check for workspace ID override in the node configuration
        if (node.workspaceIdProp && node.workspaceIdPropType === "str" && node.workspaceIdProp.trim()) {
          workspaceId = node.workspaceIdProp;
        }
      } else {
        // Try to get config ID from request body or query params
        seqeraConfigId = req.query.seqeraConfig || req.body?.seqeraConfig;
        if (seqeraConfigId) {
          const configNode = RED.nodes.getNode(seqeraConfigId);
          if (configNode) {
            baseUrl = configNode.baseUrl || baseUrl;
            workspaceId = configNode.workspaceId;
          }
        }
      }

      // Also check for workspace ID override in query parameters (from frontend)
      if (req.query.workspaceId && req.query.workspaceId.trim()) {
        workspaceId = req.query.workspaceId;
      }

      if (!workspaceId) {
        return res.json([]); // Return empty array instead of error for better UX
      }

      // Create a temporary node-like object for apiCall if we don't have a real node
      const nodeForApi = node || {
        seqeraConfig: RED.nodes.getNode(seqeraConfigId),
        warn: () => {}, // Dummy warn function
      };

      if (!nodeForApi.seqeraConfig) {
        return res.json([]);
      }

      const { apiCall } = require("./_utils");

      // Build the pipelines API URL
      const pipelinesUrl = `${baseUrl.replace(
        /\/$/,
        "",
      )}/pipelines?workspaceId=${workspaceId}&max=50&offset=0&search=${encodeURIComponent(search)}&visibility=all`;

      const response = await apiCall(nodeForApi, "get", pipelinesUrl, {
        headers: { Accept: "application/json" },
      });

      const pipelines = response.data?.pipelines || [];
      const results = pipelines.map((pipeline) => ({
        value: pipeline.name,
        label: pipeline.name,
      }));

      res.json(results);
    } catch (error) {
      // Return empty array on error for better UX
      res.json([]);
    }
  });

  function SeqeraWorkflowLaunchNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Save typedInput property configs
    node.launchpadNameProp = config.launchpadName;
    node.launchpadNamePropType = config.launchpadNameType;
    node.paramsProp = config.paramsKey;
    node.paramsPropType = config.paramsKeyType;
    node.paramsArray = config.params || [];
    node.runNameProp = config.runName;
    node.runNamePropType = config.runNameType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;
    node.sourceWorkspaceIdProp = config.sourceWorkspaceId;
    node.sourceWorkspaceIdPropType = config.sourceWorkspaceIdType;
    node.sessionIdProp = config.sessionId;
    node.sessionIdPropType = config.sessionIdType;

    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";

    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");
    const { apiCall } = require("./_utils");

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
      const runName = await evalProp(node.runNameProp, node.runNamePropType);
      const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
      const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);
      const sourceWorkspaceIdOverride = await evalProp(node.sourceWorkspaceIdProp, node.sourceWorkspaceIdPropType);
      const sessionId = await evalProp(node.sessionIdProp, node.sessionIdPropType);

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

          const pipelinesResp = await apiCall(node, "get", pipelinesUrl, { headers: { Accept: "application/json" } });
          const pipelines = pipelinesResp.data?.pipelines || [];
          const match = pipelines.find((p) => p.name === launchpadName) || pipelines[0];
          if (!match) throw new Error(`No pipeline found for launchpadName '${launchpadName}'`);

          const launchCfgUrl = `${baseUrl.replace(/\/$/, "")}/pipelines/${
            match.pipelineId
          }/launch?workspaceId=${workspaceId}`;
          const launchResp = await apiCall(node, "get", launchCfgUrl, { headers: { Accept: "application/json" } });
          if (!launchResp.data || !launchResp.data.launch) throw new Error("Invalid launch config response");

          const lp = { ...launchResp.data.launch };
          if (lp.computeEnv?.id) {
            lp.computeEnvId = lp.computeEnv.id;
            delete lp.computeEnv;
          }
          body = { launch: lp };
        } catch (errFetch) {
          node.error(`Failed to resolve launchpad name '${launchpadName}': ${errFetch.message}`, msg);
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

      // Evaluate params array
      const paramsFromArray = {};
      for (const param of node.paramsArray) {
        if (param.name && param.name.trim()) {
          const evaluatedValue = await evalProp(param.value, param.valueType);
          paramsFromArray[param.name] = evaluatedValue;
        }
      }

      // Merge params: start with existing launch.paramsText, then paramsObj (from JSON field), then paramsArray (individual params)
      if ((paramsObj && typeof paramsObj === "object") || Object.keys(paramsFromArray).length > 0) {
        body.launch = body.launch || {};
        let existingParams = {};
        if (body.launch.paramsText) {
          try {
            existingParams = JSON.parse(body.launch.paramsText);
          } catch (_) {}
        }
        // Merge in order: existing -> paramsObj -> paramsFromArray (individual params take precedence)
        const mergedParams = { ...existingParams };
        if (paramsObj && typeof paramsObj === "object") {
          Object.assign(mergedParams, paramsObj);
        }
        Object.assign(mergedParams, paramsFromArray);
        body.launch.paramsText = JSON.stringify(mergedParams);
      }

      // Set custom run name if provided
      if (runName && runName.trim()) {
        body.launch = body.launch || {};
        body.launch.runName = runName.trim();
      }

      // Set sessionId for resuming failed workflows if provided
      // When sessionId is provided (non-empty string), automatically enable resume
      if (sessionId && sessionId.trim && sessionId.trim()) {
        body.launch = body.launch || {};
        body.launch.sessionId = sessionId.trim();
        body.launch.resume = true;
      }

      // Build URL with query params
      let url = `${baseUrl.replace(/\/$/, "")}/workflow/launch`;
      const qs = new URLSearchParams();
      if (workspaceId != null) qs.append("workspaceId", workspaceId);
      if (sourceWorkspaceId != null) qs.append("sourceWorkspaceId", sourceWorkspaceId);
      if (qs.toString()) url += `?${qs.toString()}`;

      // Headers
      const headers = { "Content-Type": "application/json" };

      try {
        const response = await apiCall(node, "post", url, { headers, data: body });
        msg.payload = response.data;
        msg.workflowId = response.data?.workflowId || response.data?.workflow?.id;
        node.status({ fill: "green", shape: "dot", text: `launched: ${formatDateTime()}` });
        send(msg);
        if (done) done();
      } catch (err) {
        node.error(`Seqera API request failed: ${err.message}\nRequest: POST ${url}`, msg);
        node.status({ fill: "red", shape: "ring", text: `error: ${formatDateTime()}` });
        return;
      }
    });
  }

  RED.nodes.registerType("seqera-workflow-launch", SeqeraWorkflowLaunchNode, {
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
      sessionId: { value: "" },
      sessionIdType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
    },
  });
};
