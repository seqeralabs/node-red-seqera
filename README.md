<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/ewels/node-red-seqera/raw/main/docs/img/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/ewels/node-red-seqera/raw/main/docs/img/logo.svg">
  <img src="https://github.com/ewels/node-red-seqera/raw/main/docs/img/logo.svg" alt="@seqera/node-red-seqera">
</picture>
</h1>

A set of Node-RED nodes for interacting with Seqera Platform.

Gives new Node-RED node types for your automation workflows, which are designed to work together:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/ewels/node-red-seqera/raw/main/docs/img/nodes-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/ewels/node-red-seqera/raw/main/docs/img/nodes.png">
  <img src="https://github.com/ewels/node-red-seqera/raw/main/docs/img/nodes.png" alt="@seqera/node-red-seqera nodes" align="right" width="400" >
</picture>

- [Create Dataset](#create-dataset)
- [Monitor a Run](#monitor-a-run)
- [List Files from Data Explorer](#list-data-link-files)
- [Poll Data Link Files](#poll-data-link-files)

Also [Launch](#launch) and [Monitor](#monitor-a-run) nodes for automation tasks, giving you full control over workflow execution and tracking.

# Typical Use cases

- Integration with events _coming from_ and _going to_ third-party services (AWS, Slack, and [>5000 others](https://flows.nodered.org/search?type=node) supported by Node-RED)
- Link triggers and actions to build automation logic using a graphical builder
- Chain workflows, launching downstream automatically
- (Bonus) Use with [Home Assistant](https://community.home-assistant.io/t/home-assistant-community-add-on-node-red/55023) to make your office lights go into disco mode when a pipeline completes 🪩 🕺🏻 🎉

> [!NOTE]
> This package includes several example flows which you can import and repurpose.
> **See the [example docs](./docs/README.md) for more information.**

# Installation

## Within Node-RED

_File_ > _Manage Palette_, then the _Install_ tab.
Search for `@seqera/node-red-seqera` (or just "seqera") and you
should find this package. Click _Install_ and the nodes will be available.

## Via the command line

Install via the Node-RED palette manager _or_ from the command line inside your Node-RED user directory (`~/.node-red`):

```bash
npm install @seqera/node-red-seqera
```

## Seqera Studios

This repository comes with a custom Docker image containing both Node-RED and the Seqera nodes, designed to run within
[Seqera Studios](https://docs.seqera.io/platform-cloud/studios/overview).

Simply create a new Studio with the _Template_ set to _Prebuilt container image_ and enter:

```
ghcr.io/ewels/node-red-seqera:latest
```

Make sure that the studio is set to _Always keep the session running_.

Your new Studio should launch with a complete Node-RED instance that's ready for you to customise and use with Seqera automation.

> [!NOTE]
> This image is designed to be a reference only to get you started only.
> You may want to customise the `studios-template/Dockerfile` and `studios-template/settings.js` files.

## Example Flows

Once installed, example flows are available in the Node-RED import menu under _Import_ > _Examples_ > _@seqera/node-red-seqera_.
See the [example docs](./docs/README.md) for more information.

# Usage

## Seqera Config Node

Create a Seqera Config node to store your API credentials and default settings.

This is used by all other Seqera Node-RED nodes, so that you only
have to enter your Seqera credentials once.

- **Base URL**: The base URL for the Seqera API (default: https://api.cloud.seqera.io)
- **Workspace ID**: Your Seqera workspace ID
- **Token**: Your Seqera API token. Create a Seqera access token via [_Your Tokens_](https://cloud.seqera.io/tokens) in the user menu.

## Create Dataset

Creates a new Dataset and uploads its file contents in one step.

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
- `msg._seqera_upload_request`: Details of the file-upload request (for debugging)

## Launch workflow

Launches a workflow using the Seqera API.

### Inputs

- `launchpadName`: The Human-readable name of a pipeline in the launchpad to use
- `params`: JSON object containing parameters to merge with the launchpad's default parameters
- `workspaceId`: Override the workspace ID from the \* config node
- `sourceWorkspaceId`: The source workspace ID (if a shared workflow and different to workspaceId)

Alternative input:

- `msg.body`: A full launch request body (alternative to using launchpadName)

## Monitor a workflow

Checks the status of an existing workflow in Seqera Platform.

### Inputs

- `workflowId`: The ID of the workflow run to query (defaults to `msg.workflowId`).
- `workspaceId`: Override the workspace ID from the \* config node.

### Configuration

- `keepPolling` (boolean): If **true** (default) the node will continue polling the workflow status until it reaches a terminal state.
- `pollInterval` (number): How frequently to poll when _keepPolling_ is enabled (in seconds, default **5**).

### Outputs (three outputs)

1. Sent on every status poll while the workflow is active (submitted / running / pending).
2. Sent once when the workflow completes successfully.
3. Sent once when the workflow fails, is cancelled, or any non-success terminal state.

Each message contains:

- `msg.payload`: The workflow details from the API
- `msg.workflowId`: The ID of the workflow

## List Data Link Files

Lists files and folders from a Seqera Platform **Data Explorer** link.

### Inputs

- **dataLinkName** (string): The Data Explorer link to query.
- **basePath** (string): Path within the data link to start browsing. Leave blank for the root.
- **prefix** (string): Optional prefix filter (applies to files _and_ folders).
- **pattern** (string): Optional regular-expression pattern filter (applies to **files** only).
- **returnType** (string): Choose what to return: `files`, `folders`, or `all` (everything).
- **maxResults** (number): Maximum number of results to return (default: 100).
- **depth** (number): How many directory levels to recurse into (0 = current dir only).
- **workspaceId** (string): Override the workspace ID from the Config node.

### Outputs (one output)

- `msg.payload` (array): Array of objects returned by the API after filtering.
- `msg.files` (array): Convenience array containing only the file names.

## Poll Data Link Files

Like **List Data Link Files**, but runs automatically on a timer so that you can trigger downstream automation whenever new data appears.

This node has **no inputs** – it starts polling as soon as the Node-RED flow is deployed.

### Inputs (typed-input fields)

Same as _List Data Link Files_, plus:

- **pollFrequency** (number): How often to poll (default: 15 minutes).

### Outputs (two outputs)

1. **All results** – Fired every poll with the full list returned from the API.
2. **New results** – Fired only when at least one object is detected that wasn't present in the previous poll (will not send anything if there are no new objects).

Each message contains the same properties as _List Data Link Files_ (`payload`, `files`).

### Outputs (one output)

- `msg.payload`: The launch response from the API
- `msg.workflowId`: The ID of the launched workflow

# License

Apache-2.0 license
