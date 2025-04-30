# node-red-contrib-seqera

A Node-RED node for interacting with the Seqera Platform API.

## Installation

Install via the Node-RED palette manager **or** from the command line inside your Node-RED user directory (`~/.node-red`):

```bash
npm install node-red-contrib-seqera
```

## Usage

### Seqera Config Node

Create a Seqera Config node to store your API credentials and default settings.

- **Base URL**: The base URL for the Seqera API (default: https://api.cloud.seqera.io)
- **Workspace ID**: Your Seqera workspace ID
- **Token**: Your Seqera API token

### Seqera Launch Monitor Node

Launches a workflow and then periodically checks its status until completion.

#### Inputs

- **pollInterval**: How frequently to check workflow status (in seconds)
- **launchpadName**: The Human-readable name of a pipeline in the launchpad to use
- **params**: JSON object containing parameters to merge with the launchpad's default parameters
- **workspaceId**: Override the workspace ID from the config node
- **sourceWorkspaceId**: The source workspace ID (if a shared workflow and different to workspaceId)

Alternative input:

- **msg.body**: A full launch request body (alternative to using launchpadName)

#### Outputs (three wires)

1. Sent on every status poll (only when workflow is active)
2. Sent once when the workflow completes successfully
3. Sent once when the workflow fails, is cancelled, or any non-success terminal state

Each message contains:

- **msg.payload**: The workflow details from the API
- **msg.workflowId**: The ID of the workflow
- **msg.\_seqera_request**: The request details sent to the API (when error occurs)
- **msg.\_seqera_error**: Any error details if the request fails

### Seqera Workflow Node

Queries the status of a workflow.

#### Inputs

- **workflowId**: The ID of the workflow to query
- **workspaceId**: Override the workspace ID from the config node

#### Outputs (two wires)

1. Only receives messages when the workflow is active (submitted, running, or pending)

   - Contains: `msg.payload` and `msg.workflowId`

2. Receives messages when the workflow has completed (success or failure) OR when an API error occurs
   - For completed workflows: Contains `msg.payload` and `msg.workflowId`
   - For API errors: Also contains `msg._seqera_request` and `msg._seqera_error`

### Seqera Launch Node

Launches a workflow using the Seqera API.

#### Inputs

- **launchpadName**: The Human-readable name of a pipeline in the launchpad to use
- **params**: JSON object containing parameters to merge with the launchpad's default parameters
- **workspaceId**: Override the workspace ID from the config node
- **sourceWorkspaceId**: The source workspace ID (if a shared workflow and different to workspaceId)

Alternative input:

- **msg.body**: A full launch request body (alternative to using launchpadName)

#### Outputs (one wire)

- **msg.payload**: The launch response from the API
- **msg.workflowId**: The ID of the launched workflow
- **msg.\_seqera_request**: The request details sent to the API (when error occurs)
- **msg.\_seqera_error**: Any error details if the request fails

## License

MIT
