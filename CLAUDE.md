# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node-RED extension providing custom nodes for interacting with the Seqera Platform API. Users install this package in Node-RED to build automation workflows that launch, monitor, and manage Nextflow pipelines on Seqera Platform.

**Key package details:**

- Package name: `@seqera/node-red-seqera`
- Published to npm and distributed via Node-RED's palette manager
- Also available as Docker images: `ghcr.io/seqeralabs/node-red-seqera` (base) and `ghcr.io/seqeralabs/node-red-seqera-studios` (Seqera Studios)

## Development Commands

```bash
# Linting (uses pre-commit hooks)
pre-commit run --all-files

# No build step required - Node-RED loads .js files directly
# To test locally, install in your Node-RED user directory:
cd ~/.node-red
npm install /path/to/this/repo
```

## Architecture

### Node Registration Pattern

All nodes follow a standard Node-RED registration pattern:

1. **Module export function** receives `RED` runtime object
2. **Node constructor function** receives config from editor and calls `RED.nodes.createNode(this, config)`
3. **Registration** via `RED.nodes.registerType(type, constructor, options)`
4. **HTML counterpart** (same filename but `.html`) defines editor UI, help text, and default values

### Shared Configuration: seqera-config

All Seqera nodes depend on a `seqera-config` node that stores:

- Base URL (default: `https://api.cloud.seqera.io`)
- API token (stored in credentials)
- Workspace ID

This config is referenced via `node.seqeraConfig = RED.nodes.getNode(config.seqera)`.

### Shared Utilities ([nodes/\_utils.js](nodes/_utils.js))

**Core helpers:**

- `buildHeaders(node, extraHeaders)` - Constructs headers with Bearer token from seqera-config
- `apiCall(node, method, url, options)` - Axios wrapper that merges auth headers, logs failures, and re-throws errors
- `handleDatalinkAutoComplete(RED, req, res)` - HTTP endpoint handler for Data Link name autocomplete (used by datalink-list and datalink-poll nodes)

### Property Evaluation Pattern

Nodes use Node-RED's typedInput system allowing properties to be:

- Static strings (`str`)
- Message properties (`msg`)
- JSONata expressions (`jsonata`)
- Flow/global context
- JSON literals

**Evaluation helper (present in most nodes):**

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
```

Always evaluate properties inside the `node.on("input", ...)` handler so they reflect current message context.

### Node Types

**[workflow-launch.js](nodes/workflow-launch.js):**

- Launches pipelines via `/workflow/launch` endpoint
- Can resolve launchpad names (fetches pipeline config from `/pipelines` then `/pipelines/{id}/launch`)
- Merges `paramsObj` into `launch.paramsText` as JSON
- Sets custom `runName` if provided
- Returns `msg.workflowId` for chaining with monitor node

**[workflow-monitor.js](nodes/workflow-monitor.js):**

- Polls workflow status at configurable interval (default 5s)
- Three outputs: Active (yellow), Succeeded (green), Failed (red)
- Stops polling when workflow reaches terminal state or `keepPolling` is false
- Status mapping: `submitted|pending` → yellow, `running` → blue, `completed|succeeded` → green, `failed|error|cancelled` → red

**[dataset-create.js](nodes/dataset-create.js):**

- Creates dataset via POST `/datasets` then uploads file via POST `/datasets/{id}/upload`
- Supports CSV/TSV file types with MIME type selection
- Uses `form-data` for multipart upload
- Returns `msg.datasetId`

**[datalink-list.js](nodes/datalink-list.js):**

- Lists files/folders from Data Explorer links via `/data-links` and `/data-browser`
- Filters by prefix (applied to both files/folders) and pattern (regex, files only)
- Supports recursion depth and max results
- Returns `msg.payload.files` (full objects) and `msg.files` (string array of paths)

**[datalink-poll.js](nodes/datalink-poll.js):**

- Automatically polls Data Link at configured intervals (default 15 min)
- Parses frequency as seconds, `MM:SS`, `HH:MM:SS`, or `DD-HH:MM:SS`
- Two outputs: "All results" (every poll) and "New results" (only new files detected)
- Tracks seen files in node context to detect changes

**[studios-create.js](nodes/studios-create.js):**

- Creates Seqera Studios via POST `/studios`
- Configures container, compute environment, resources (CPU/memory/GPU)
- Mounts Data Links specified in `mountData` array
- Returns `msg.studioId`

**[studios-monitor.js](nodes/studios-monitor.js):**

- Polls Studio status at configurable interval (default 5s) with units (seconds/minutes/hours)
- Three outputs: All checks (every poll), Ready (running), Terminated (stopped/errored/buildFailed)
- Stops polling when Studio reaches terminal state or `keepPolling` is false
- Status mapping: `starting|building|stopping` → yellow, `running` → blue, `stopped` → green, `errored|buildFailed` → red
- Output 1 fires every poll, Output 2 fires **once** on transition to `running`, Output 3 fires on termination
- Tracks `previousStatus` to detect state transitions and prevent duplicate ready notifications

### HTTP Admin Endpoints

Several nodes register HTTP endpoints on Node-RED's admin API for editor features:

- `GET /admin/seqera/pipelines/:nodeId` - Launchpad/pipeline autocomplete for workflow-launch
- `GET /admin/seqera/datalinks/:nodeId` - Data Link autocomplete for datalink-list/poll
- `GET /seqera-config/connectivity-check` - Test API token validity
- `GET /seqera-config/workspaces` - Fetch organizations and workspaces for config UI

These endpoints handle cases where the node doesn't exist yet (during initial config) by extracting config from query params.

### Status Display Pattern

Nodes display status in the editor using:

```javascript
node.status({
  fill: "blue|yellow|green|red|grey",
  shape: "ring|dot",
  text: `status: ${formatDateTime()}`,
});
```

**Common pattern:**

- Blue ring = in progress
- Yellow ring = intermediate step
- Green dot = success
- Red dot = error
- Grey dot = idle

### Error Handling

- Use `node.error(message, msg)` to report errors to Node-RED
- Use `node.warn(obj)` for non-fatal warnings (used in `apiCall` for API failures)
- Always set status to red dot on error
- Clear polling intervals on error (for monitor/poll nodes)

## Token Permissions

From README, minimum required roles:

- Launch workflow: **Maintain**
- Monitor workflow: **View**
- Create Dataset: **Launch**
- List/Poll Data Link Files: **Maintain**
- Create Studio: **Maintain**

For full automation, use **Maintain** role token.

## Example Flows

Located in [examples/](examples/) directory. Available via Node-RED's Import > Examples menu. See [docs/README.md](docs/README.md) for detailed descriptions.

## File Organization

```
nodes/           - Node implementation files (.js + .html pairs)
  _utils.js      - Shared helper functions
  config.js      - Seqera configuration node
  workflow-*.js  - Workflow launch/monitor nodes
  dataset-*.js   - Dataset creation node
  datalink-*.js  - Data Link list/poll nodes + shared utils
  studios-*.js   - Studio creation node
examples/        - Example flows (.json) and test data
docker/          - Dockerfiles and Node-RED config for containers
docs/            - Documentation and images
```

## Common Patterns When Adding New Nodes

1. Create paired `.js` and `.html` files in `nodes/`
2. In `.js`: export function receiving `RED`, define node constructor, register with `RED.nodes.registerType`
3. Reference `seqera-config` node via `node.seqeraConfig = RED.nodes.getNode(config.seqera)`
4. Use `apiCall` from `_utils.js` for all API requests
5. Implement `evalProp` helper for typedInput property evaluation
6. Handle `node.on("input", async function(msg, send, done))` for message-triggered nodes
7. Use `node.status()` to update visual state in editor
8. Register node in [package.json](package.json) under `node-red.nodes`
9. Create corresponding HTML with `<script type="text/html" data-template-name="...">` for editor UI
