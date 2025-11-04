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
    node.resumeWorkflowIdProp = config.resumeWorkflowId;
    node.resumeWorkflowIdPropType = config.resumeWorkflowIdType;
    node.configProfilesProp = config.configProfiles;
    node.configProfilesPropType = config.configProfilesType;

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
      const resumeWorkflowId = await evalProp(node.resumeWorkflowIdProp, node.resumeWorkflowIdPropType);
      const configProfiles = await evalProp(node.configProfilesProp, node.configProfilesPropType);

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

      // Set config profiles if provided
      if (configProfiles) {
        body.launch = body.launch || {};
        // Handle different input types: string (CSV), array, or already formatted
        if (typeof configProfiles === "string" && configProfiles.trim()) {
          // Split comma-separated string and trim each profile name
          body.launch.configProfiles = configProfiles
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p);
        } else if (Array.isArray(configProfiles) && configProfiles.length > 0) {
          // Use array directly, filtering out empty values
          body.launch.configProfiles = configProfiles.filter((p) => p && p.trim && p.trim());
        }
      }

      // Resume from a previous workflow if workflow ID is provided
      // This fetches the workflow's launch config and sessionId, then relaunches with resume enabled
      if (resumeWorkflowId && resumeWorkflowId.trim && resumeWorkflowId.trim()) {
        const wfId = resumeWorkflowId.trim();

        try {
          // Fetch the workflow details to get the commitId (may be null if workflow was cancelled early)
          const workflowUrl = `${baseUrl.replace(/\/$/, "")}/workflow/${wfId}?workspaceId=${workspaceId}`;
          const workflowResp = await apiCall(node, "get", workflowUrl, {
            headers: { Accept: "application/json" },
          });

          if (!workflowResp.data || !workflowResp.data.workflow) {
            throw new Error("Invalid workflow response");
          }

          const workflow = workflowResp.data.workflow;
          const commitId = workflow.commitId;

          // Fetch the workflow launch config (includes sessionId and resumeCommitId)
          const workflowLaunchUrl = `${baseUrl.replace(/\/$/, "")}/workflow/${wfId}/launch?workspaceId=${workspaceId}`;
          const workflowLaunchResp = await apiCall(node, "get", workflowLaunchUrl, {
            headers: { Accept: "application/json" },
          });

          if (!workflowLaunchResp.data || !workflowLaunchResp.data.launch) {
            throw new Error("Invalid workflow launch config response");
          }

          const wfLaunch = workflowLaunchResp.data.launch;

          // Determine resume behavior based on whether workflow actually ran tasks:
          // - If workflow ran tasks (has commitId), set resume=true and include revision field
          // - If workflow was cancelled before tasks (no commitId), set resume=false and omit revision
          // Priority: resumeCommitId > revision from launch config > commitId from workflow
          const hasCommitId = wfLaunch.resumeCommitId || wfLaunch.revision || commitId;
          const shouldSetResumeFlag = !!hasCommitId;

          // Create minimal resume launch config matching what the CLI sends
          const resumeLaunch = {
            id: wfLaunch.id,
            computeEnvId: wfLaunch.computeEnv?.id || wfLaunch.computeEnvId,
            pipeline: wfLaunch.pipeline,
            workDir: wfLaunch.workDir || wfLaunch.resumeDir,
            sessionId: wfLaunch.sessionId,
            resume: shouldSetResumeFlag,
            pullLatest: wfLaunch.pullLatest || false,
            stubRun: wfLaunch.stubRun || false,
            dateCreated: new Date().toISOString(),
          };

          // Include revision field only if we have a valid commit hash
          if (hasCommitId) {
            resumeLaunch.revision = hasCommitId;
          }

          // Merge in paramsText if it was set via the params fields
          if (body.launch && body.launch.paramsText) {
            resumeLaunch.paramsText = body.launch.paramsText;
          }

          // Include runName if it was set
          if (runName && runName.trim()) {
            resumeLaunch.runName = runName.trim();
          }

          body.launch = resumeLaunch;
        } catch (errResume) {
          node.error(`Failed to fetch workflow launch config for resume: ${errResume.message}`, msg);
          node.status({ fill: "red", shape: "ring", text: `error: ${formatDateTime()}` });
          return;
        }
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

        // Add request details to msg.request (with masked credentials)
        msg.request = {
          method: "POST",
          url: url,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer ***MASKED***",
          },
          body: body,
        };

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
      resumeWorkflowId: { value: "" },
      resumeWorkflowIdType: { value: "str" },
      configProfiles: { value: "" },
      configProfilesType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
    },
  });
};
