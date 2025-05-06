module.exports = function (RED) {
  function SeqeraLaunchMonitorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store typedInput properties
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
    node.pollIntervalProp = config.poll;
    node.pollIntervalPropType = config.pollType;

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

    let intervalId = null;

    const clearAllIntervals = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    node.on("close", () => {
      clearAllIntervals();
    });

    node.on("input", async function (msg, send, done) {
      clearAllIntervals();
      node.status({ fill: "blue", shape: "ring", text: `launching: ${formatDateTime()}` });

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
      const pollInterval = await evalProp(node.pollIntervalProp, node.pollIntervalPropType);

      const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
      const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;
      const sourceWorkspaceId = sourceWorkspaceIdOverride || null;
      node.pollIntervalSec = parseInt(pollInterval, 10) || 5;

      let body = msg.body || msg.payload;

      const buildHeaders = () => {
        const headers = { "Content-Type": "application/json" };
        const token =
          tokenOverride ||
          (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) ||
          (node.credentials && node.credentials.token);
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return headers;
      };

      try {
        // resolve launchpad if needed
        try {
          if (launchpadName) {
            const headersGet = buildHeaders();
            const pipelinesUrl = `${baseUrl.replace(
              /\/$/,
              "",
            )}/pipelines?workspaceId=${workspaceId}&max=50&offset=0&search=${encodeURIComponent(
              launchpadName,
            )}&visibility=all`;
            const pipelinesResp = await axios.get(pipelinesUrl, { headers: headersGet });
            const pipelines = (pipelinesResp.data && pipelinesResp.data.pipelines) || [];
            const match = pipelines.find((p) => p.name === launchpadName) || pipelines[0];
            if (!match) throw new Error(`No pipeline found for ${launchpadName}`);
            const launchCfgUrl = `${baseUrl.replace(/\/$/, "")}/pipelines/${
              match.pipelineId
            }/launch?workspaceId=${workspaceId}`;
            const launchResp = await axios.get(launchCfgUrl, { headers: headersGet });
            const lp = { ...launchResp.data.launch };
            if (lp.computeEnv && lp.computeEnv.id) {
              lp.computeEnvId = lp.computeEnv.id;
              delete lp.computeEnv;
            }
            body = { launch: lp };
          }
        } catch (err) {
          err.api_call = "Workflow fetch";
          throw err;
        }

        if (!body || !body.launch) throw new Error("No launch body specified");

        // merge paramsText
        if (paramsObj && typeof paramsObj === "object") {
          body.launch = body.launch || {};
          let existing = {};
          if (body.launch.paramsText) {
            try {
              existing = JSON.parse(body.launch.paramsText);
            } catch (_) {}
          }
          body.launch.paramsText = JSON.stringify({ ...existing, ...paramsObj });
        }

        // build POST url
        let postUrl = `${baseUrl.replace(/\/$/, "")}/workflow/launch`;
        const qs = new URLSearchParams();
        if (workspaceId != null) qs.append("workspaceId", workspaceId);
        if (sourceWorkspaceId != null) qs.append("sourceWorkspaceId", sourceWorkspaceId);
        if (qs.toString().length) postUrl += `?${qs.toString()}`;

        msg._seqera_request = { method: "POST", url: postUrl, headers: buildHeaders(), body };

        const postResp = await axios.post(postUrl, body, { headers: buildHeaders() });
        msg.payload = postResp.data;
        msg.workflowId = postResp.data.workflowId || (postResp.data.workflow && postResp.data.workflow.id);
        node.status({ fill: "yellow", shape: "ring", text: `submitted: ${formatDateTime()}` });

        send([null, null, null]); // initial empty send maybe ignore

        if (!msg.workflowId) {
          throw new Error("workflowId not returned");
        }

        // helper to map status to color
        const mapColor = (stat) => {
          const s = (stat || "").toLowerCase();
          if (/^(submitted|pending)$/.test(s)) return "yellow";
          if (/^(running)$/.test(s)) return "blue";
          if (/^(completed|succeeded|success)$/.test(s)) return "green";
          if (/^(failed|error)$/.test(s)) return "red";
          return "grey";
        };

        // start polling loop every pollIntervalSec
        const pollFn = async () => {
          try {
            const wfUrlBase = `${baseUrl.replace(/\/$/, "")}/workflow/${msg.workflowId}`;
            const wfUrl = workspaceId ? `${wfUrlBase}?workspaceId=${workspaceId}` : wfUrlBase;
            const wfResp = await axios.get(wfUrl, { headers: buildHeaders() });
            const wfMsg = {
              ...msg,
              payload: wfResp.data,
              workflowId: msg.workflowId,
            };
            const status = wfResp.data.workflow && wfResp.data.workflow.status;
            const lower = (status || "").toLowerCase();

            // Show status with ring shape while active
            if (/^(submitted|running|pending)$/.test(lower)) {
              node.status({ fill: mapColor(lower), shape: "ring", text: `${lower}: ${formatDateTime()}` });
              send([wfMsg, null, null]); // Send to first output while polling
              return; // keep polling
            }

            // Final states
            clearAllIntervals();
            if (/^(completed|succeeded|success)$/.test(lower)) {
              node.status({ fill: "green", shape: "dot", text: `completed: ${formatDateTime()}` });
              send([null, wfMsg, null]); // Success output
            } else {
              node.status({ fill: mapColor(lower), shape: "dot", text: `${lower}: ${formatDateTime()}` });
              send([null, null, wfMsg]); // Error/other output
            }
          } catch (err) {
            err.api_call = "Polling";
            throw err;
          }
        };

        intervalId = setInterval(pollFn, node.pollIntervalSec * 1000);
        pollFn();

        if (done) done();
      } catch (err) {
        if (!err.api_call) err.api_call = "launch";
        node.status({ fill: "red", shape: "dot", text: `error: ${formatDateTime()}` });
        msg._seqera_error = err.response
          ? { status: err.response.status, data: err.response.data }
          : { message: err.message };
        send([null, null, msg]);
        if (done) done({ "Error type": err.api_call, error: msg._seqera_error });
      }
    });
  }

  RED.nodes.registerType("seqera-launch-monitor", SeqeraLaunchMonitorNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqeraConfig: { value: "", type: "seqera-config", required: true },
      pollInterval: { value: "5" },
      pollIntervalType: { value: "num" },
      launchpadName: { value: "launchpadName" },
      launchpadNameType: { value: "str" },
      paramsKey: { value: "params" },
      paramsKeyType: { value: "str" },
      baseUrl: { value: "baseUrl" },
      baseUrlType: { value: "str" },
      workspaceId: { value: "workspaceId" },
      workspaceIdType: { value: "str" },
      sourceWorkspaceId: { value: "sourceWorkspaceId" },
      sourceWorkspaceIdType: { value: "str" },
      token: { value: "token" },
      tokenType: { value: "str" },
    },
  });
};
