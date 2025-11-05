---
title: Monitor workflow
---

# Monitor workflow

Poll the status of an existing workflow run until it reaches a terminal state.

## Inputs

-   **workflowId** (required, default: `msg.workflowId`): ID of the workflow to monitor.
-   **workspaceId**: Override the workspace ID from the Config node.

## Configuration

-   **keepPolling** (default **true**): Continue polling until the workflow is finished.
-   **pollInterval** (default **5 seconds**): Frequency of status checks. Can be configured in seconds, minutes, or hours.

## Outputs (three)

The monitor node has three separate outputs that fire at different times:

1. **Active**: Emitted on every poll while the workflow is in `submitted`, `pending` or `running`.
2. **Succeeded**: Emitted once when the workflow reaches a success status (`completed`, `succeeded`).
3. **Failed**: Emitted once for any terminal non-success status (`failed`, `error`, `cancelled`, &).

Each message contains:

-   `msg.payload`: Full workflow object from the API.
-   `msg.workflowId`: Convenience copy of the workflow ID.

## Status mapping

The node displays visual status in the Node-RED editor:

-   `submitted`, `pending` � Yellow ring (starting)
-   `running` � Blue ring (in progress)
-   `completed`, `succeeded` � Green dot (success)
-   `failed`, `error`, `cancelled` � Red dot (error/stopped)

## Required permissions

Minimum required role: **View**

## Example usage

### Simple monitoring

1. Add a **workflow-launch** node
2. Add a **workflow-monitor** node
3. Wire launch � monitor (the `msg.workflowId` is passed automatically)
4. Add three **debug** nodes connected to each output
5. Deploy and trigger the launch

The monitor will poll every 5 seconds and show the workflow progress in the debug panel.

### Conditional actions on completion

Connect different logic to each output:

-   **Output 1 (Active)**: Update a dashboard or log progress
-   **Output 2 (Succeeded)**: Send a success notification, trigger downstream processing
-   **Output 3 (Failed)**: Send an alert, log the error, or trigger auto-resume logic

### Monitoring without continuous polling

To check workflow status just once without continuous polling:

1. Set **keepPolling** to `false`
2. The node will perform a single status check and output immediately
3. Useful for scheduled checks or manual status queries

## Notes

-   The monitor stops polling automatically when a terminal state is reached
-   All three outputs preserve custom message properties from the input (e.g., `msg._context`, `msg.correlationId`)
-   For long-running workflows, consider increasing the poll interval to reduce API calls

## See also

-   [Simple launch & monitor example](../examples/01-simple-launch-monitor.md)
-   [Auto-resume on failure example](../examples/03-auto-resume-on-failure.md)
