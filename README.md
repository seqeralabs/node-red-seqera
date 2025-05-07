<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/ewels/node-red-contrib-seqera/raw/main/images/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/ewels/node-red-contrib-seqera/raw/main/images/logo.svg">
  <img src="https://github.com/ewels/node-red-contrib-seqera/raw/main/images/logo.svg" alt="node-red-contrib-seqera">
</picture>
</h1>

A Node-RED node for interacting with the Seqera Platform API.

Gives new Node-RED node types for your automation workflows, which are designed to work together:

<img src="https://github.com/ewels/node-red-contrib-seqera/raw/main/images/nodes.png#gh-light-mode-only" alt="node-red-contrib-seqera nodes" align="right" width="400">
<img src="https://github.com/ewels/node-red-contrib-seqera/raw/main/images/nodes-dark.png#gh-dark-mode-only" alt="node-red-contrib-seqera nodes" align="right" width="400">

- [Create Dataset](#create-dataset)
- [Launch and Monitor a Run](#launch-and-monitor-a-run)

Also [Launch](#launch) and [Workflow](#workflow) nodes for more custom workflows where polling workflow status is not required and it's helpful to have full control.

# Installation

Install via the Node-RED palette manager **or** from _ the command line inside your Node-RED user directory _ (`~/.node-red`):

```bash
npm install node-red-contrib-seqera
```

# Usage

## Seqera Config Node

Create a Seqera Config node to store your API credentials and default settings.

- **Base URL**: The base URL for the Seqera API (default: https://api.cloud.seqera.io)
- **Workspace ID**: Your Seqera workspace ID
- **Token**: Your Seqera API token

## Create Dataset

Creates a new dataset and uploads its file contents in one step.

### Inputs

- `datasetName`: Name of the dataset to create
- `fileContents`: CSV/TSV (string or Buffer) to upload. Defaults to `msg.payload`.
- `fileType`: _csv_ or _tsv_ – Select the MIME type for the upload (defaults to **csv**). This is required by Seqera Platform to validate the file contents.
- `description`: Optional description string for the dataset
- `workspaceId`: Override the workspace ID from the \* config node

### Outputs (one output)

Fired once when the upload completes successfully.

- `msg.payload`: Upload response from the API
- `msg.datasetId`: The ID of the created dataset
- `msg._seqera_request`: Details of the dataset creation request (for debugging)
- `msg._seqera_upload_request`: Details of the file-upload request (for debugging)

## Launch and Monitor a Run

Launches a workflow and then periodically checks its status until completion.

### Inputs

- `pollInterval`: How frequently to check workflow status (in seconds)
- `launchpadName`: The Human-readable name of a pipeline in the launchpad to use
- `params`: JSON object containing parameters to merge with the launchpad's default parameters
- `workspaceId`: Override the workspace ID from the \* config node
- `sourceWorkspaceId`: The source workspace ID (if a shared workflow and different to workspaceId)

Alternative input:

- `msg.body`: A full launch request body (alternative to using launchpadName)

### Outputs (three outputs)

1. Sent on every status poll (only when workflow is active)
2. Sent once when the workflow completes successfully
3. Sent once when the workflow fails, is cancelled, or any non-success terminal state

Each message contains:

- `msg.payload`: The workflow details from the API
- `msg.workflowId`: The ID of the workflow
- `msg._seqera_request`: The request details sent to the API (when error occurs)
- `msg._seqera_error`: Error details (when error occurs)

## Launch

Launches a workflow using the Seqera API.

### Inputs

- `launchpadName`: The Human-readable name of a pipeline in the launchpad to use
- `params`: JSON object containing parameters to merge with the launchpad's default parameters
- `workspaceId`: Override the workspace ID from the \* config node
- `sourceWorkspaceId`: The source workspace ID (if a shared workflow and different to workspaceId)

Alternative input:

- `msg.body`: A full launch request body (alternative to using launchpadName)

### Outputs (one output)

- `msg.payload`: The launch response from the API
- `msg.workflowId`: The ID of the launched workflow
- `msg._seqera_request`: The request details sent to the API (when error occurs)
- `msg._seqera_error`: Any error details if the request fails

## Workflow

Queries the status of a workflow.

### Inputs

- **workflowId**: The ID of the workflow to query
- **workspaceId**: Override the workspace ID from the \* config node

### Outputs (two outputs)

1. Only receives messages when the workflow is active (submitted, running, or pending)
2. Receives messages when the workflow has completed (success or failure) OR when an API error occurs

Each message contains:

- `msg.payload`: The workflow details from the API
- `msg.workflowId`: The ID of the workflow
- `msg._seqera_request`: The request details sent to the API (when error occurs)
- `msg._seqera_error`: Error details (when error occurs)

# License

MIT
