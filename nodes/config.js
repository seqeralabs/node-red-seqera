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

  // Server-side HTTP endpoint for fetching organizations and workspaces
  RED.httpAdmin.get("/seqera-config/workspaces", async function (req, res) {
    try {
      const { baseUrl, token } = req.query;

      if (!token) {
        return res.json({
          success: false,
          message: "No API token provided",
        });
      }

      if (!baseUrl) {
        return res.json({
          success: false,
          message: "No base URL provided",
        });
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // First, fetch organizations
      const orgsResponse = await axios.get(`${baseUrl}/orgs`, {
        headers,
        timeout: 10000,
      });

      if (!orgsResponse.data || !orgsResponse.data.organizations) {
        return res.json({
          success: false,
          message: "Invalid organizations response",
        });
      }

      const organizations = orgsResponse.data.organizations
        .filter((org) => org.name !== "community") // Skip community org
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

      // Fetch workspaces for each organization
      const orgWorkspaces = await Promise.all(
        organizations.map(async (org) => {
          try {
            const workspacesResponse = await axios.get(`${baseUrl}/orgs/${org.orgId}/workspaces`, {
              headers,
              timeout: 10000,
            });

            const workspaces = workspacesResponse.data?.workspaces || [];

            return {
              orgId: org.orgId,
              orgName: org.name,
              orgFullName: org.fullName,
              workspaces: workspaces.sort((a, b) => a.name.localeCompare(b.name)), // Sort workspaces alphabetically
            };
          } catch (error) {
            // If we can't fetch workspaces for an org, return empty array
            console.warn(`Failed to fetch workspaces for org ${org.name}:`, error.message);
            return {
              orgId: org.orgId,
              orgName: org.name,
              orgFullName: org.fullName,
              workspaces: [],
            };
          }
        }),
      );

      return res.json({
        success: true,
        organizations: orgWorkspaces.filter((org) => org.workspaces.length > 0), // Only include orgs with workspaces
      });
    } catch (error) {
      let message = "Failed to fetch workspaces";

      if (error.response) {
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
