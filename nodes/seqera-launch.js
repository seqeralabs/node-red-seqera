module.exports = function(RED) {
    function SeqeraLaunchNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Reference to shared Seqera configuration node (optional)
        node.seqeraConfig = RED.nodes.getNode(config.seqera);
        // Base URL fallback
        node.baseUrl = (node.seqeraConfig && node.seqeraConfig.baseUrl) || config.baseUrl || 'https://api.cloud.seqera.io';

        // Legacy credentials fallback (deprecated)
        node.credentials = RED.nodes.getCredentials(node.id);

        const axios = require('axios');

        node.on('input', async function(msg, send, done) {
            // Indicate launch starting
            node.status({ fill: 'blue', shape: 'ring', text: `${new Date().toLocaleTimeString()} launching` });

            // Resolve runtime values
            const baseUrl = msg.baseUrl || (node.seqeraConfig && node.seqeraConfig.baseUrl) || node.baseUrl;
            const workspaceId = msg.workspaceId || (node.seqeraConfig && node.seqeraConfig.workspaceId) || null;
            const sourceWorkspaceId = msg.sourceWorkspaceId || null;

            const launchpadName = msg.launchpadName || null;

            let body = msg.body || msg.payload;

            // If launchpadName is provided we need to query the launchpad APIs to build launch JSON
            if (launchpadName) {
                try {
                    // Find pipeline by name
                    const pipelinesUrl = `${baseUrl.replace(/\/$/, '')}/pipelines?workspaceId=${workspaceId}&max=50&offset=0&search=${encodeURIComponent(launchpadName)}&visibility=all`;
                    const headersGet = { 'Accept': 'application/json' };
                    const token = msg.token || (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) || (node.credentials && node.credentials.token);
                    if (token) headersGet['Authorization'] = `Bearer ${token}`;

                    const pipelinesResp = await axios.get(pipelinesUrl, { headers: headersGet });
                    const pipelines = pipelinesResp.data && pipelinesResp.data.pipelines || [];
                    const match = pipelines.find(p => p.name === launchpadName) || pipelines[0];
                    if (!match) throw new Error(`No pipeline found for launchpadName '${launchpadName}'`);

                    const launchConfigUrl = `${baseUrl.replace(/\/$/, '')}/pipelines/${match.pipelineId}/launch?workspaceId=${workspaceId}`;
                    const launchResp = await axios.get(launchConfigUrl, { headers: headersGet });
                    if (!launchResp.data || !launchResp.data.launch) {
                        throw new Error('Invalid launch config response');
                    }

                    // Reformat launch JSON expected by submit endpoint
                    const lp = { ...launchResp.data.launch };
                    if (lp.computeEnv && lp.computeEnv.id) {
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
                done(new Error('No request body supplied (and no launchpadName resolved). Provide JSON payload in msg.body/msg.payload or a valid msg.launchpadName.'));
                return;
            }

            // Build URL and query parameters
            let url = `${baseUrl.replace(/\/$/, '')}/workflow/launch`;
            const params = new URLSearchParams();
            if (workspaceId !== null && workspaceId !== undefined) {
                params.append('workspaceId', workspaceId);
            }
            if (sourceWorkspaceId !== null && sourceWorkspaceId !== undefined) {
                params.append('sourceWorkspaceId', sourceWorkspaceId);
            }
            const queryString = params.toString();
            if (queryString.length) {
                url += `?${queryString}`;
            }

            // Prepare headers
            const headers = { 'Content-Type': 'application/json' };
            const token = msg.token || (node.seqeraConfig && node.seqeraConfig.credentials && node.seqeraConfig.credentials.token) || (node.credentials && node.credentials.token);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            try {
                const response = await axios.post(url, body, { headers });
                msg.payload = response.data;
                // Convenience: expose workflowId at msg level for downstream nodes
                if (response.data) {
                    if (response.data.workflowId) {
                        msg.workflowId = response.data.workflowId;
                    } else if (response.data.workflow && response.data.workflow.id) {
                        msg.workflowId = response.data.workflow.id;
                    }
                }
                // Success status
                node.status({ fill: 'green', shape: 'dot', text: `${new Date().toLocaleTimeString()} launched` });
                send(msg);
                if (done) done();
            } catch (err) {
                // Attach request & error details for downstream debugging
                msg._seqera_request = { method: 'POST', url, headers, body };
                msg._seqera_error = err.response ? { status: err.response.status, data: err.response.data } : { message: err.message };

                // Log error
                node.error(`Seqera API request failed: ${err.message}\nRequest: POST ${url}`, msg);
                node.status({ fill: 'red', shape: 'ring', text: `${new Date().toLocaleTimeString()} error` });

                // Forward the message so downstream debug nodes can inspect it
                send(msg);

                if (done) done(err);
            }
        });
    }

    // Register node – with legacy credential support for backwards compatibility (token field hidden in UI)
    RED.nodes.registerType('seqera-launch', SeqeraLaunchNode, {
        credentials: {
            token: { type: 'password' }
        }
    });
};
