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
};
