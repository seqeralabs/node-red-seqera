<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/logo.svg">
  <img src="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/logo.svg" alt="@seqera/node-red-seqera">
</picture>
</h1>

A set of Node-RED nodes for interacting with Seqera Platform.

Gives new Node-RED node types for your automation workflows, which are designed to work together:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/nodes-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/nodes.png">
  <img src="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/nodes.png" alt="@seqera/node-red-seqera nodes" align="right" width="400" >
</picture>

- [Launch a workflow](#launch-a-workflow)
- [Monitor a workflow](#monitor-a-workflow)
- [Create Dataset](#create-a-dataset)
- [List Files from Data Explorer](#list-data-link-files)
- [Poll Data Link Files](#poll-data-link-files)
- [Create a Seqera Studio](#create-studio)
- [Monitor a Seqera Studio](#monitor-studio)

> [!IMPORTANT]
> This is an open-source project for community benefit. It is provided as-is and is not part of Seqera's officially supported toolset.

# Typical Use cases

- Integration with events _coming from_ and _going to_ third-party services (AWS, Slack, and [>5000 others](https://flows.nodered.org/search?type=node) supported by Node-RED)
- Link triggers and actions to build automation logic using a graphical builder
- Chain workflows, launching downstream automatically
- (Bonus) Use with [Home Assistant](https://community.home-assistant.io/t/home-assistant-community-add-on-node-red/55023) to make your office lights go into disco mode when a pipeline completes 🪩 🕺🏻 🎉

> [!TIP]
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

## Docker

This repository comes with a custom Docker image containing both Node-RED and the Seqera nodes, so that you can quickly launch a complete instance of Node-RED with everything you need.

> [!NOTE]
> This image is designed to be a reference only to get you started only.
> You may want to customise the `docker/Dockerfile` and `docker/settings.js` files.

The image can be found at (also with verioned tags):

```
ghcr.io/seqeralabs/node-red-seqera:latest
```

To run, you can use a Docker command such as the following:

```bash
docker run -p 1880:1880 ghcr.io/seqeralabs/node-red-seqera:latest
```

Please note that you will need to mount a local data folder to save progress, or save flows using _Projects_, in case you need to kill the container to upgrade or similar.
See [the Node-RED documentation](https://nodered.org/docs/getting-started/docker) for more details.

## Seqera Studios

In addition to the base Docker image, the repo has an image specifically designed to run within [Seqera Studios](https://docs.seqera.io/platform-cloud/studios/overview), called `ghcr.io/seqeralabs/node-red-seqera-studios` (note `-studios` suffix).

To use, create a new Studio with the _Template_ set to _Prebuilt container image_ and enter:

```
ghcr.io/seqeralabs/node-red-seqera-studios:latest
```

Make sure that the studio is set to _Always keep the session running_.

Your new Studio should launch with a complete Node-RED instance that's ready for you to customise and use with Seqera automation.

## Example Flows

Once installed, example flows are available in the Node-RED import menu under _Import_ > _Examples_ > _@seqera/node-red-seqera_.
See the [example docs](./docs/README.md) for more information.

# Usage

## Seqera Config Node

Create a Seqera Config node to store your API credentials and default settings.

This is used by all other Seqera Node-RED nodes, so that you only
have to enter your Seqera credentials once.

- **Base URL**: The base URL for the Seqera API (default: https://api.cloud.seqera.io)
- **Token**: Your Seqera API token. Create a Seqera access token via [_Your Tokens_](https://cloud.seqera.io/tokens) in the user menu.
- **Workspace ID**: Your Seqera workspace ID

### Required Token Permissions

| Node                      | Minimum Role Required |
| ------------------------- | --------------------- |
| Launch workflow           | Maintain              |
| Monitor workflow          | View                  |
| Create Dataset            | Launch                |
| List/Poll Data Link Files | Maintain              |
| Create Studio             | Maintain              |
| Monitor Studio            | View                  |

For full automation functionality, use a token with the **Maintain** role.

## Launch a workflow

Launch a new workflow (pipeline run) on Seqera Platform.

### Inputs

- **Seqera config**: Reference to the seqera-config node containing API credentials and default workspace settings.
- **Node name**: Optional custom name for the node in the editor.
- **Launchpad**: Name of a Launchpad entry. The node will look up the pipeline, fetch its default launch configuration and submit the run. Supports autocomplete.
- **Run name**: Custom name for the workflow run. Optional - if left blank, Seqera Platform will generate a default name automatically.
- **Resume from**: Workflow ID (Run ID) from a previous workflow run to resume. Optional - typically extracted from `msg.workflowId` of a monitored workflow. When a workflow ID is provided, the node automatically fetches the workflow's session ID and enables Nextflow resume.
- **Parameters**: Individual parameter key-value pairs configured in the node editor's editable list. Each parameter can be a string, number, boolean, JSON object, or evaluated from message properties. These take highest precedence when merging.
- **Params JSON**: A complete JSON object containing multiple parameters. By default this is a JSON literal (`{}`), but can be changed to read from a message property like `msg.params`. Merged before individual parameters.
- **Workspace ID**: Override the workspace ID from the Config node.
- **Source WS ID**: Workspace that owns the source pipeline when launching a shared workflow.

### Outputs

- `msg.payload` – Raw API response.
- `msg.workflowId` – Convenience copy of the submitted workflow ID.

## Monitor a workflow

Poll the status of an existing workflow run until it reaches a terminal state.

### Inputs

- **workflowId** (required, default: `msg.workflowId`): ID of the workflow to monitor.
- **workspaceId**: Override the workspace ID from the Config node.

### Configuration

- **keepPolling** (default **true**): Continue polling until the workflow is finished.
- **pollInterval** (default **5 seconds**): Frequency of status checks. Can be configured in seconds, minutes, or hours.

### Outputs (three)

1. **Active** – Emitted on every poll while the workflow is in `submitted`, `pending` or `running`.
2. **Succeeded** – Emitted once when the workflow reaches a success status (`completed`, `succeeded`).
3. **Failed** – Emitted once for any terminal non-success status (`failed`, `error`, `cancelled`, …).

Each message contains:

- `msg.payload` – Full workflow object from the API.
- `msg.workflowId` – Convenience copy of the workflow ID.

## Create Dataset

Create a new Dataset and upload its tabular contents in one step.

### Inputs

- **datasetName** (required): Name of the Dataset to create.
- **fileContents** (required, default `msg.payload`): CSV/TSV content to upload.
- **fileType** (default **csv**): Either `csv` or `tsv`. Determines the MIME type and file extension.
- **description**: Dataset description.
- **workspaceId**: Override the workspace ID from the Config node.
- **baseUrl**: Override the Seqera API URL.

### Outputs (one)

- `msg.payload` – API response from the upload request.
- `msg.datasetId` – ID of the newly-created Dataset.

## List Files from Data Explorer

Retrieve objects from a Seqera **Data Explorer** link (Data Link).

### Inputs

- **dataLinkName** (required): Display name of the Data Link.
- **basePath**: Path within the Data Link to start from.
- **prefix**: Prefix filter applied to both files and folders.
- **pattern**: Regular-expression filter applied to files _after_ the prefix filter.
- **returnType** (default **files**): `files`, `folders` or `all`.
- **maxResults** (default **100**): Maximum number of objects to return.
- **depth** (default **0**): Folder recursion depth (`0` = current dir only).
- **workspaceId**: Override the workspace ID from the Config node.
- **baseUrl**: Override the Seqera API URL.

### Outputs (one)

- `msg.payload.files` – Array of objects returned by the API (after filtering).
- `msg.payload.resourceType`, `msg.payload.resourceRef`, `msg.payload.provider` – Metadata describing the Data Link.
- `msg.files` – Convenience array containing fully-qualified object names.

## Poll Data Link Files

Periodically list a Data Link and emit messages when new objects appear. The node starts polling as soon as the flow is deployed – it has **no message inputs**.

### Properties

All of the inputs from _List Files from Data Explorer_ node, plus:

- **pollFrequency** (default **15 min**): Interval between polls expressed as seconds (`90`), `MM:SS`, `HH:MM:SS` or `DD-HH:MM:SS`.

### Outputs (two)

1. **All results** – Emitted every poll with the full, filtered list.
2. **New results** – Emitted only when one or more _new_ objects are detected since the last poll.

Both messages include the same properties:

- `msg.payload.files`, `msg.payload.resourceType`, `msg.payload.resourceRef`, `msg.payload.provider`.
- `msg.files` – Convenience array of fully-qualified object names.
- `msg.payload.nextPoll` (only on the _All results_ output) – ISO timestamp of the next scheduled poll.

## Create Studio

Create a new **Studio** (interactive workspace) on Seqera Platform.

### Inputs

- **studioName** (required): Studio display name.
- **containerUri** (required): Container image URI for the Studio tool.
- **computeEnvId** (required): ID of the Compute Environment to run on.
- **description**: Text description for the Studio.
- **mountData**: One or more Data Link names to mount inside the Studio.
- **cpu** (default **2**)
- **memory** (default **8192**)
- **gpu** (default **0**)
- **initialCheckpointId**
- **condaEnvironment**
- **lifespanHours**: Maximum lifetime before auto-stop.
- **isPrivate** (default **false**)
- **spot** (default **false**)
- **autoStart** (default **true**)
- **workspaceId**: Override the workspace ID from the Config node.
- **baseUrl**: Override the Seqera API URL.

### Outputs (one)

- `msg.payload` – Full API response.
- `msg.studioId` – ID of the created Studio.

## Monitor Studio

Poll the status of an existing **Studio** session until it reaches a terminal state.

### Inputs

- **studioId** (required, default: `msg.studioId`): ID of the Studio session to monitor.
- **workspaceId**: Override the workspace ID from the Config node.

### Configuration

- **keepPolling** (default **true**): Continue polling until the Studio reaches a terminal state (stopped, errored, or buildFailed).
- **pollInterval** (default **5 seconds**): Frequency of status checks. Can be configured in seconds, minutes, or hours.

### Outputs (three)

1. **All status checks** – Emitted on every poll regardless of state, for monitoring and logging.
2. **Ready to use** – Emitted **once** when the Studio status transitions to `running` (ready for connections).
3. **Terminated** – Emitted when the Studio is no longer running (`stopped`, `errored`, or `buildFailed`).

Each message contains:

- `msg.payload` – Full Studio object from the API, including `statusInfo` with current status details.
- `msg.studioId` – ID of the Studio session.

### Status Details

The Studio status progression typically follows this sequence:

- **starting** → Initial provisioning (yellow)
- **building** → Container image is being built (yellow)
- **running** → Studio is active and ready to use (blue) - **Output 2 fires here**
- **stopping** → Shutdown in progress (yellow)
- **stopped** → Successfully terminated (green) - **Output 3 fires here**
- **errored** → Runtime error occurred (red) - **Output 3 fires here**
- **buildFailed** → Container build failed (red) - **Output 3 fires here**

When **keepPolling** is disabled, the node performs a single status check and outputs the result immediately without waiting for terminal states.

**Tip:** Connect Output 2 to subsequent automation (e.g., send a Slack notification when Studio is ready). This output only fires once on the state transition to `running`, making it perfect for triggering actions without duplicate messages. Use Output 3 for cleanup or error handling.

# License

Apache-2.0 license
