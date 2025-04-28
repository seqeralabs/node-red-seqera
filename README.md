# node-red-contrib-seqera

Node-RED nodes for interacting with the [Seqera Platform](https://seqera.io/) REST API.

## Installation

Install via the Node-RED palette manager **or** from the command line inside your Node-RED user directory (`~/.node-red`):

```bash
npm install node-red-contrib-seqera
```

## Nodes

### Seqera config (`seqera-config`)

Central store for connection settings that can be shared by every Seqera node in your flows:

| Property | Purpose |
|----------|---------|
| **Base URL** | URL of your Seqera Platform instance (defaults to the cloud `https://api.cloud.seqera.io`). |
| **Workspace ID** | Numeric workspace identifier. Used by launch / query operations when provided (optional). |
| **API token** | Bearer token with the required permissions for the chosen workspace / instance (optional but usually required). |

Create one of these nodes and reference it from the launch / workflow nodes instead of duplicating credentials everywhere.

---

### Launch workflow (`seqera-launch`)

Submits a new workflow execution.

**Preferred usage**

Set `msg.launchpadName` to the name of a Launchpad entry. The node will automatically fetch the Launchpad configuration and submit the workflow.

**Advanced / custom usage**

You can instead supply a full launch request JSON in `msg.payload` (or `msg.body`) following the *SubmitWorkflowLaunchRequest* schema.

Optional override properties in the incoming `msg`:

| Property | Type | Description |
|----------|------|-------------|
| `workspaceId` | number | Target workspace (defaults to value from config node). |
| `sourceWorkspaceId` | number | Source workspace (optional). |
| `launchpadName` | string | Name of Launchpad pipeline preset (preferred). |
| `baseUrl` | string | Override Base URL. |
| `token` | string | Override bearer token. |

**Outputs (one wire)**

`msg.payload` – API response JSON (SubmitWorkflowLaunchResponse). On success the node also sets `msg.workflowId` for downstream use.

On error the message is still sent with `msg._seqera_request` and `msg._seqera_error` attached.

---

### Check workflow (`seqera-workflow`)

Retrieves details of an existing workflow execution.

**Inputs**

- Any message containing `msg.workflowId`.

Optional override properties are the same as the launch node (`workspaceId`, `baseUrl`, `token`).

**Outputs (two wires)**

| Wire | Condition |
|------|-----------|
| **1** | Fired when `payload.workflow.status` matches **submitted** or **running** (case-insensitive). |
| **2** | Fired for all other statuses, or when the API call fails. |

Each output message contains:

* `msg.payload` – JSON response from the `/workflow/{id}` endpoint.
* `msg.workflowId` – Convenience copy of `payload.workflow.id`.

On error the message also carries `msg._seqera_request` and `msg._seqera_error` (see Debugging section).

## Authentication

Create a **Seqera config** node and enter your bearer API token there. All Seqera nodes that reference this config will automatically reuse the token. The token is sent in an `Authorization: Bearer <token>` header.

## Debugging

If a Seqera node receives a non-successful response (for example HTTP 4xx/5xx) or any other error, it will:

1. Write a descriptive message to the Node-RED log / debug sidebar.
2. Forward the original message so that downstream nodes can inspect it.
3. Attach two helper properties to the message:

   * `msg._seqera_request` – the HTTP request that was attempted (method, URL, headers and, for launches, the JSON body).
   * `msg._seqera_error`   – details of the error response (`status`, `data`) if available, or a simple error message.

This means you can wire a **Debug** node (set to "complete msg") to the failure path and immediately see the full API request and response, which makes it much easier to spot authentication or payload issues.

---

This is an early release. Pull requests and issues welcome!
