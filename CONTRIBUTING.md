# Contributing to node-red-seqera

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for setting up your development environment and contributing code.

## Table of Contents

- [Development Setup](#development-setup)
- [Running Node-RED Locally](#running-node-red-locally)
- [Code Structure](#code-structure)
- [Code Style and Linting](#code-style-and-linting)
- [Adding New Nodes](#adding-new-nodes)
- [Testing Your Changes](#testing-your-changes)
- [Docker Development](#docker-development)
- [Submitting Changes](#submitting-changes)

## Development Setup

### Prerequisites

- Node.js >= 12.0.0
- Node-RED >= 2.0.0
- Git
- (Optional) Python 3 with pip for pre-commit hooks

### Clone the Repository

```bash
git clone https://github.com/seqeralabs/node-red-seqera.git
cd node-red-seqera
```

### Install Dependencies

```bash
npm install
```

### Set Up Pre-commit Hooks (Optional but Recommended)

This project uses pre-commit hooks for code quality checks:

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Install the git hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

## Running Node-RED Locally

The easiest way to test your changes is to install the package locally in your Node-RED user directory.

### Method 1: Using npm link (Recommended for Active Development)

```bash
# From the node-red-seqera directory
npm link

# Navigate to your Node-RED user directory
cd ~/.node-red

# Link the package
npm link @seqera/node-red-seqera
```

Now restart Node-RED, and any changes you make to the code will be immediately reflected (you may need to restart Node-RED to see changes).

### Method 2: Using Local File Path in package.json

Add the package to your Node-RED `package.json` using a local file path:

```bash
cd ~/.node-red
```

Edit `~/.node-red/package.json` and add:

```json
{
  "dependencies": {
    "@seqera/node-red-seqera": "file:../path/to/node-red-seqera"
  }
}
```

For example, if your repository is in `~/GitHub/seqera/node-red-seqera`:

```json
{
  "dependencies": {
    "@seqera/node-red-seqera": "file:../GitHub/seqera/node-red-seqera"
  }
}
```

Then run:

```bash
npm install
```

### Method 3: Direct Installation

```bash
cd ~/.node-red
npm install /path/to/node-red-seqera
```

### Starting Node-RED

```bash
# Start Node-RED
node-red

# Or if installed globally
npm start
```

Open your browser to `http://localhost:1880` to access the Node-RED editor.

### Reloading Changes

After making code changes:

- **JavaScript files (`.js`)**: Restart Node-RED
- **HTML files (`.html`)**: Refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)
- **No build step required**: Node-RED loads files directly

## Code Structure

```
node-red-seqera/
├── nodes/              # Node implementation files
│   ├── _utils.js       # Shared utilities (apiCall, buildHeaders, etc.)
│   ├── config.js       # Seqera config node
│   ├── workflow-*.js   # Workflow nodes
│   ├── dataset-*.js    # Dataset nodes
│   ├── datalink-*.js   # Data Link nodes
│   └── studios-*.js    # Studios nodes
├── examples/           # Example flows and test data
├── docker/            # Dockerfiles and Node-RED settings
├── docs/              # Documentation and images
├── CLAUDE.md          # AI assistant guidance
└── package.json       # Package configuration
```

### Key Files

- **`nodes/_utils.js`**: Shared helper functions used across all nodes
  - `buildHeaders(node, extraHeaders)`: Constructs auth headers
  - `apiCall(node, method, url, options)`: Axios wrapper with error handling
  - `handleDatalinkAutoComplete(RED, req, res)`: Autocomplete endpoint handler

- **Node files**: Each node has a pair of files:
  - `.js`: Node logic and API calls
  - `.html`: Editor UI, help text, and defaults

## Code Style and Linting

This project uses ESLint with pre-commit hooks to maintain code quality.

### Running Linters Manually

```bash
# Run all pre-commit checks
pre-commit run --all-files

# Run on specific files
pre-commit run --files nodes/workflow-launch.js
```

### Style Guidelines

- Use 2 spaces for indentation
- Use semicolons
- Use single quotes for strings (except in JSON)
- Follow Node-RED naming conventions:
  - Node types: `seqera-workflow-launch`
  - Config nodes: `seqera-config`
- Always use async/await for promises
- Handle errors with `node.error(message, msg)`
- Update status with `node.status({ fill, shape, text })`

## Adding New Nodes

### 1. Create Node Files

Create a pair of `.js` and `.html` files in the `nodes/` directory:

```bash
touch nodes/my-new-node.js
touch nodes/my-new-node.html
```

### 2. Implement the JavaScript File

```javascript
module.exports = function (RED) {
  const { apiCall } = require("./_utils");

  function MyNewNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Get reference to seqera-config node
    node.seqeraConfig = RED.nodes.getNode(config.seqera);

    node.on("input", async function (msg, send, done) {
      try {
        // Your logic here
        const result = await apiCall(
          node,
          "GET",
          `/your-endpoint`,
          {}
        );

        msg.payload = result.data;
        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "dot", text: "Error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("seqera-my-new-node", MyNewNode);
};
```

### 3. Create the HTML File

```html
<script type="text/javascript">
  RED.nodes.registerType("seqera-my-new-node", {
    category: "Seqera Platform",
    color: "#4c9ac7",
    defaults: {
      name: { value: "" },
      seqera: { type: "seqera-config", required: true }
    },
    inputs: 1,
    outputs: 1,
    icon: "seqera.svg",
    label: function () {
      return this.name || "My New Node";
    }
  });
</script>

<script type="text/html" data-template-name="seqera-my-new-node">
  <div class="form-row">
    <label for="node-input-seqera"><i class="fa fa-cog"></i> Seqera Config</label>
    <input type="text" id="node-input-seqera" />
  </div>
  <div class="form-row">
    <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>
    <input type="text" id="node-input-name" placeholder="Name" />
  </div>
</script>

<script type="text/html" data-help-name="seqera-my-new-node">
  <p>A brief description of what this node does.</p>
  <h3>Inputs</h3>
  <dl class="message-properties">
    <dt>payload <span class="property-type">string</span></dt>
    <dd>The input description.</dd>
  </dl>
  <h3>Outputs</h3>
  <dl class="message-properties">
    <dt>payload <span class="property-type">object</span></dt>
    <dd>The output description.</dd>
  </dl>
</script>
```

### 4. Register the Node

Add your node to `package.json`:

```json
{
  "node-red": {
    "nodes": {
      "seqera-my-new-node": "nodes/my-new-node.js"
    }
  }
}
```

### 5. Test Your Node

Restart Node-RED and look for your node in the "Seqera Platform" category in the palette.

## Testing Your Changes

### Manual Testing

1. Start Node-RED with your local changes
2. Import example flows from `examples/`
3. Configure with your Seqera credentials
4. Test the nodes and verify behavior

### Testing with Docker

Build and run the Docker image locally:

```bash
# Build the base image
docker build -f docker/Dockerfile -t node-red-seqera-test .

# Run the container
docker run -p 1880:1880 node-red-seqera-test

# For Studios image
docker build -f docker/Dockerfile.studios -t node-red-seqera-studios-test .
docker run -p 1880:1880 node-red-seqera-studios-test
```

### API Testing

Use the example flows in the `examples/` directory to test common workflows:

- **Launch and Monitor**: Test workflow launching and monitoring
- **Data Link Polling**: Test Data Link file detection
- **Dataset Creation**: Test dataset upload
- **Studios**: Test Studio creation and monitoring

## Docker Development

### Directory Structure

```
docker/
├── Dockerfile          # Base Node-RED + Seqera nodes
├── Dockerfile.studios  # Optimized for Seqera Studios
└── settings.js         # Custom Node-RED configuration
```

### Building Images

```bash
# Base image
docker build -f docker/Dockerfile -t ghcr.io/seqeralabs/node-red-seqera:latest .

# Studios image
docker build -f docker/Dockerfile.studios -t ghcr.io/seqeralabs/node-red-seqera-studios:latest .
```

### Testing Local Changes in Docker

Modify the Dockerfile to copy local files during development:

```dockerfile
# Add before npm install
COPY . /tmp/node-red-seqera/
RUN cd /data && npm install /tmp/node-red-seqera
```

## Submitting Changes

### 1. Fork and Branch

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/node-red-seqera.git
cd node-red-seqera

# Add upstream remote
git remote add upstream https://github.com/seqeralabs/node-red-seqera.git

# Create a feature branch
git checkout -b feature/my-new-feature
```

### 2. Make Your Changes

- Write clear, descriptive commit messages
- Keep commits focused and atomic
- Update documentation if needed (README.md, CLAUDE.md, or inline help)
- Add example flows if introducing new functionality

### 3. Test Your Changes

- Test manually with Node-RED
- Run linting: `pre-commit run --all-files`
- Verify all existing example flows still work

### 4. Push and Create Pull Request

```bash
# Push to your fork
git push origin feature/my-new-feature

# Create a pull request on GitHub
```

### Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots or flow examples if applicable
- Ensure CI checks pass
- Be responsive to review feedback

## Common Patterns

### Property Evaluation

Use the `evalProp` helper to support typedInput fields:

```javascript
const evalProp = async (p, t, msg) => {
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

// Usage
const workflowId = await evalProp(
  config.workflowId,
  config.workflowIdType,
  msg
);
```

### HTTP Admin Endpoints

Register admin endpoints for autocomplete features:

```javascript
RED.httpAdmin.get("/admin/seqera/my-endpoint/:nodeId", async (req, res) => {
  try {
    // Implementation
    res.json({ items: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Status Updates

Provide visual feedback in the editor:

```javascript
node.status({ fill: "blue", shape: "ring", text: "Processing..." });
node.status({ fill: "green", shape: "dot", text: "Success" });
node.status({ fill: "red", shape: "dot", text: "Error" });
```

## Getting Help

- **Documentation**: Check [CLAUDE.md](CLAUDE.md) for detailed architecture notes
- **Issues**: Search existing [GitHub issues](https://github.com/seqeralabs/node-red-seqera/issues)
- **Questions**: Open a new issue with the "question" label

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
