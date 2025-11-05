---
title: Launch workflow
---

# Launch workflow

Launch a new workflow (pipeline run) on Seqera Platform.

## Inputs

- **Seqera config**: Reference to the seqera-config node containing API credentials and default workspace settings.
- **Node name**: Optional custom name for the node in the editor.
- **Launchpad**: Name of a Launchpad entry. The node will look up the pipeline, fetch its default launch configuration and submit the run. Supports autocomplete.
- **Run name**: Custom name for the workflow run. Optional - if left blank, Seqera Platform will generate a default name automatically.
- **Resume from**: Workflow ID (Run ID) from a previous workflow run to resume. Optional - typically extracted from `msg.workflowId` of a monitored workflow.
- **Parameters**: Individual parameter key-value pairs configured in the node editor's editable list. Each parameter can be a string, number, boolean, JSON object, or evaluated from message properties. These take highest precedence when merging.
- **Params JSON**: A complete JSON object containing multiple parameters. By default this is a JSON literal (`{}`), but can be changed to read from a message property like `msg.params`. Merged before individual parameters.
- **Workspace ID**: Override the workspace ID from the Config node.
- **Source WS ID**: Workspace that owns the source pipeline when launching a shared workflow.

## Outputs

- `msg.payload` – Raw API response.
- `msg.workflowId` – Convenience copy of the submitted workflow ID.

## Configuration

### Providing parameters

The workflow-launch node supports two methods for providing parameters:

1. **Params JSON** (`paramsKey`): A JSON object that gets merged into `launch.paramsText`
2. **Parameters list** (`paramsArray`): Individual key-value pairs from editable list (highest precedence)

Parameters from the list take precedence over the Params JSON, allowing you to override specific values while using a base parameter set.

### Resuming workflows

To resume a failed or cancelled workflow, provide the workflow ID in the **Resume from** field. The node will:

1. Fetch workflow details from `/workflow/{id}` to get commitId
2. Fetch launch config from `/workflow/{id}/launch` to get sessionId and resumeCommitId
3. If workflow ran tasks (has commitId): Set `resume: true` and include `revision` field
4. If workflow was cancelled before tasks (no commitId): Set `resume: false` and omit `revision` field

This allows Nextflow to resume from the point of failure rather than restarting from scratch.

!!! tip
Connect the **Failed** output of a workflow-monitor node to a workflow-launch node with **Resume from** set to `msg.workflowId` to automatically retry failed workflows.

## Required permissions

Minimum required role: **Maintain**

See the [configuration documentation](configuration.md#required-token-permissions) for a full table of required permissions for all nodes.

## Example usage

### Simple launch

1. Add an **inject** node to trigger the launch
2. Add a **workflow-launch** node
3. Configure the Seqera config and Launchpad name
4. Wire inject � workflow-launch
5. Add a **debug** node to see the output
6. Deploy and click the inject button

### Launch with custom parameters

1. Add a **function** node before the workflow-launch node:
   ```javascript
   msg.params = {
     outdir: "s3://mybucket/results",
     email: "user@example.com",
   };
   return msg;
   ```
2. In the workflow-launch node, set **Params JSON** to `msg.params`
3. Add individual overrides in the **Parameters** list if needed

### Auto-resume on failure

See the [Auto-resume on failure example](../examples/03-auto-resume-on-failure.md) for a complete flow that automatically retries failed workflows.
