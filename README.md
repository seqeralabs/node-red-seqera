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

### Seqera Workflow Node

Fetches workflow details from the Seqera API.

#### Inputs

- **workflowId**: The ID of the workflow to fetch
- **baseUrl**: Override the base URL from the config node
- **workspaceId**: Override the workspace ID from the config node
- **token**: Override the API token from the config node

#### Outputs

- **msg.payload**: The workflow details from the API
- **msg.\_seqera_request**: The request details sent to the API
- **msg.\_seqera_error**: Any error details if the request fails

### Seqera Launch Node

Launches a workflow using the Seqera API.

#### Inputs

- **launchpadName**: The name of the launchpad to use
- **params**: A JSON object of parameters to merge with the launchpad's default parameters
- **baseUrl**: Override the base URL from the config node
- **workspaceId**: Override the workspace ID from the config node
- **sourceWorkspaceId**: The source workspace ID
- **token**: Override the API token from the config node

Alternative input:

- **msg.body**: A full launch request body (alternative to using launchpadName)

#### Outputs

- **msg.payload**: The launch response from the API
- **msg.workflowId**: The ID of the launched workflow
- **msg.\_seqera_request**: The request details sent to the API
- **msg.\_seqera_error**: Any error details if the request fails

### Seqera Launch Monitor Node

Launches a workflow and monitors its status until completion.

#### Inputs

- **launchpadName**: The name of the launchpad to use
- **params**: A JSON object of parameters to merge with the launchpad's default parameters
- **baseUrl**: Override the base URL from the config node
- **workspaceId**: Override the workspace ID from the config node
- **sourceWorkspaceId**: The source workspace ID
- **token**: Override the API token from the config node

Alternative input:

- **msg.body**: A full launch request body (alternative to using launchpadName)

#### Outputs (three wires)

1. Sent on every status poll
2. Sent once when the workflow completes successfully
3. Sent once when the workflow fails, is cancelled, or any non-success terminal state

Each message contains:

- **msg.payload**: The workflow details from the API
- **msg.workflowId**: The ID of the workflow
- **msg.\_seqera_request**: The request details sent to the API
- **msg.\_seqera_error**: Any error details if the request fails

## License

MIT
