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

            // Request body – prefer msg.body then msg.payload then static config
            const body = msg.body || msg.payload;
            if (!body) {
                done(new Error('No request body supplied. Provide JSON payload in msg.body or msg.payload'));
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
