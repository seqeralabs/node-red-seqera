const axios = require("axios");

module.exports = function (RED) {
  function SeqeraConfigNode(n) {
    RED.nodes.createNode(this, n);
    const node = this;

    // Store base URL and workspace ID from editor
    node.baseUrl = n.baseUrl || "https://api.cloud.seqera.io";
    node.workspaceId = n.workspaceId || null;

    // Credentials (API token)
    node.credentials = RED.nodes.getCredentials(node.id) || {};
  }

  RED.nodes.registerType("seqera-config", SeqeraConfigNode, {
    credentials: {
      token: { type: "password" },
    },
  });

  // Server-side HTTP endpoint for connectivity check
  RED.httpAdmin.get("/seqera-config/connectivity-check", async function (req, res) {
    try {
      const { baseUrl, token } = req.query;

      if (!token) {
        return res.json({
          success: false,
          message: "No API token provided",
          isEmptyToken: true,
        });
      }

      if (!baseUrl) {
        return res.json({
          success: false,
          message: "No base URL provided",
        });
      }

      const response = await axios.get(`${baseUrl}/user-info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200 && response.data && response.data.user) {
        return res.json({
          success: true,
          user: {
            userName: response.data.user.userName,
            email: response.data.user.email,
          },
        });
      } else {
        return res.json({
          success: false,
          message: "Invalid response from Seqera API",
        });
      }
    } catch (error) {
      let message = "Connection failed";

      if (error.response) {
        // API returned an error response
        if (error.response.status === 401 || error.response.status === 403) {
          message = "Invalid API token";
        } else {
          message = `API error: ${error.response.status}`;
        }
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        message = "Connection failed - check base URL and network";
      } else if (error.code === "ETIMEDOUT") {
        message = "Connection timeout - check network";
      }

      return res.json({
        success: false,
        message: message,
      });
    }
  });
};
