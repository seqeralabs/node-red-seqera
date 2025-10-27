module.exports = function (RED) {
  function SeqeraStudiosCreateNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // --- Store typedInput property configs
    node.studioNameProp = config.studioName;
    node.studioNamePropType = config.studioNameType;
    node.descriptionProp = config.description;
    node.descriptionPropType = config.descriptionType;
    node.containerUriProp = config.containerUri;
    node.containerUriPropType = config.containerUriType;
    node.computeEnvIdProp = config.computeEnvId;
    node.computeEnvIdPropType = config.computeEnvIdType;
    node.mountDataProp = config.mountData;
    node.mountDataPropType = config.mountDataType;
    node.cpuProp = config.cpu;
    node.cpuPropType = config.cpuType;
    node.memoryProp = config.memory;
    node.memoryPropType = config.memoryType;
    node.gpuProp = config.gpu;
    node.gpuPropType = config.gpuType;
    node.initialCheckpointIdProp = config.initialCheckpointId;
    node.initialCheckpointIdPropType = config.initialCheckpointIdType;
    node.condaEnvironmentProp = config.condaEnvironment;
    node.condaEnvironmentPropType = config.condaEnvironmentType;
    node.lifespanHoursProp = config.lifespanHours;
    node.lifespanHoursPropType = config.lifespanHoursType;
    node.isPrivateProp = config.isPrivate;
    node.isPrivatePropType = config.isPrivateType;
    node.spotProp = config.spot;
    node.spotPropType = config.spotType;
    node.autoStartProp = config.autoStart;
    node.autoStartPropType = config.autoStartType;
    node.baseUrlProp = config.baseUrl;
    node.baseUrlPropType = config.baseUrlType;
    node.workspaceIdProp = config.workspaceId;
    node.workspaceIdPropType = config.workspaceIdType;

    // Reference to the shared Seqera config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);
    node.defaultBaseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || "https://api.cloud.seqera.io";
    node.credentials = RED.nodes.getCredentials(node.id);

    const axios = require("axios");
    const { resolveDataLink } = require("./datalink-utils");
    const { apiCall } = require("./_utils");

    // Helper to format date as yyyy-mm-dd HH:MM:SS
    const formatDateTime = () => {
      const d = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${d.toLocaleTimeString()}`;
    };

    node.on("input", async function (msg, send, done) {
      node.status({ fill: "blue", shape: "ring", text: `creating: ${formatDateTime()}` });

      // Helper to evaluate properties (supports JSONata)
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

      try {
        // --- Evaluate inputs
        const studioName = await evalProp(node.studioNameProp, node.studioNamePropType);
        const description = await evalProp(node.descriptionProp, node.descriptionPropType);
        const containerUri = await evalProp(node.containerUriProp, node.containerUriPropType);
        const computeEnvId = await evalProp(node.computeEnvIdProp, node.computeEnvIdPropType);
        const mountDataRaw = await evalProp(node.mountDataProp, node.mountDataPropType);
        const cpuRaw = await evalProp(node.cpuProp, node.cpuPropType);
        const memoryRaw = await evalProp(node.memoryProp, node.memoryPropType);
        const gpuRaw = await evalProp(node.gpuProp, node.gpuPropType);
        const initialCheckpointIdRaw = await evalProp(node.initialCheckpointIdProp, node.initialCheckpointIdPropType);
        const condaEnvironment = await evalProp(node.condaEnvironmentProp, node.condaEnvironmentPropType);
        const lifespanHoursRaw = await evalProp(node.lifespanHoursProp, node.lifespanHoursPropType);
        const isPrivateRaw = await evalProp(node.isPrivateProp, node.isPrivatePropType);
        const spotRaw = await evalProp(node.spotProp, node.spotPropType);
        const autoStartRaw = await evalProp(node.autoStartProp, node.autoStartPropType);
        const baseUrlOverride = await evalProp(node.baseUrlProp, node.baseUrlPropType);
        const workspaceIdOverride = await evalProp(node.workspaceIdProp, node.workspaceIdPropType);

        // --- Derived / default values
        const baseUrl = baseUrlOverride || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.defaultBaseUrl;
        const workspaceId = workspaceIdOverride || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;
        const cpu = parseInt(cpuRaw, 10);
        const memory = parseInt(memoryRaw, 10);
        const gpu = parseInt(gpuRaw, 10);
        const cpusVal = !isNaN(cpu) && cpu > 0 ? cpu : 2;
        const memoryVal = !isNaN(memory) && memory > 0 ? memory : 8192;
        const gpuVal = !isNaN(gpu) && gpu >= 0 ? gpu : 0;
        const initialCheckpointId = initialCheckpointIdRaw !== "" ? parseInt(initialCheckpointIdRaw, 10) : null;
        const lifespanHours = lifespanHoursRaw !== "" ? parseInt(lifespanHoursRaw, 10) : null;
        const isPrivate = /^true$/i.test(String(isPrivateRaw)) || isPrivateRaw === true;
        const spot = /^true$/i.test(String(spotRaw)) || spotRaw === true;
        const autoStart = autoStartRaw === undefined || autoStartRaw === null ? undefined : !!autoStartRaw;

        if (!studioName) throw new Error("studioName not provided");
        if (!containerUri) throw new Error("containerUri (dataStudioToolUrl) not provided");
        if (!computeEnvId) throw new Error("computeEnvId not provided");

        // ----------------------------------------
        // Resolve Data Link IDs for mountData
        // ----------------------------------------
        let mountNames = [];
        if (Array.isArray(mountDataRaw)) {
          mountNames = mountDataRaw;
        } else if (typeof mountDataRaw === "string") {
          mountNames = mountDataRaw
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
        }

        const mountDataIds = [];
        if (mountNames.length) {
          for (const dlName of mountNames) {
            const resolved = await resolveDataLink(RED, node, msg, dlName, {
              baseUrl,
              workspaceId,
            });
            mountDataIds.push(resolved.dataLinkId);
          }
        }

        // ----------------------------------------
        // Build request body
        // ----------------------------------------
        const configuration = {
          gpu: gpuVal,
          cpu: cpusVal,
          memory: memoryVal,
          mountData: mountDataIds,
        };
        if (condaEnvironment) configuration.condaEnvironment = condaEnvironment;
        if (lifespanHours !== null && !isNaN(lifespanHours)) configuration.lifespanHours = lifespanHours;

        const body = {
          name: studioName,
          dataStudioToolUrl: containerUri,
          computeEnvId: computeEnvId,
          configuration,
          isPrivate: !!isPrivate,
          spot: !!spot,
        };
        if (description) body.description = description;
        if (initialCheckpointId !== null && !isNaN(initialCheckpointId)) body.initialCheckpointId = initialCheckpointId;

        // ----------------------------------------
        // Build URL with query params
        // ----------------------------------------
        let url = `${baseUrl.replace(/\/$/, "")}/studios`;
        const qs = new URLSearchParams();
        if (workspaceId != null) qs.append("workspaceId", workspaceId);
        if (autoStart !== undefined) qs.append("autoStart", autoStart ? "true" : "false");
        if (qs.toString()) url += `?${qs.toString()}`;

        const resp = await apiCall(node, "post", url, { headers: { "Content-Type": "application/json" }, data: body });
        msg.payload = resp.data;
        msg.studioId = resp.data?.studio?.sessionId || resp.data?.sessionId;
        node.status({ fill: "green", shape: "dot", text: `created: ${formatDateTime()}` });
        send(msg);
        if (done) done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: `error: ${formatDateTime()}` });
        node.error(`Seqera Studios create failed: ${err.message}`, msg);
        return;
      }
    });
  }

  RED.nodes.registerType("seqera-studios-create", SeqeraStudiosCreateNode, {
    credentials: { token: { type: "password" } },
    defaults: {
      name: { value: "" },
      seqera: { value: "", type: "seqera-config", required: true },
      studioName: { value: "", required: true },
      studioNameType: { value: "str" },
      description: { value: "" },
      descriptionType: { value: "str" },
      containerUri: { value: "" },
      containerUriType: { value: "str" },
      computeEnvId: { value: "" },
      computeEnvIdType: { value: "str" },
      mountData: { value: [] },
      mountDataType: { value: "str" },
      cpu: { value: "2" },
      cpuType: { value: "num" },
      memory: { value: "8192" },
      memoryType: { value: "num" },
      gpu: { value: "0" },
      gpuType: { value: "num" },
      initialCheckpointId: { value: "" },
      initialCheckpointIdType: { value: "num" },
      condaEnvironment: { value: "" },
      condaEnvironmentType: { value: "str" },
      lifespanHours: { value: "" },
      lifespanHoursType: { value: "num" },
      isPrivate: { value: "false" },
      isPrivateType: { value: "bool" },
      spot: { value: "false" },
      spotType: { value: "bool" },
      autoStart: { value: "true" },
      autoStartType: { value: "bool" },
      workspaceId: { value: "" },
      workspaceIdType: { value: "str" },
      baseUrl: { value: "" },
      baseUrlType: { value: "str" },
      token: { value: "" },
      tokenType: { value: "str" },
    },
  });
};
