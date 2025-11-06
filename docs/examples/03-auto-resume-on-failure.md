# Auto-resume on workflow failure

`examples/03 - Auto-resume on workflow failure.json`

`examples/05 - Auto-resume on workflow failure.json`

This workflow demonstrates how to automatically resume a failed Nextflow workflow using the workflow ID from the failed run. This pattern is useful for recovering from transient errors without re-running successfully completed tasks.

The flow implements an automatic resume pattern:

1. **Initial Launch** - A workflow is launched using the Launch workflow node
2. **Monitor** - The workflow is continuously monitored for completion
3. **Failure Detection** - If the workflow fails (output port 3 of the monitor node), the failure path is triggered
4. **Extract Workflow ID** - The workflow ID is available in `msg.workflowId` from the monitor node output
5. **Resume Launch** - The Launch workflow node is triggered with:
    - The workflow ID set in the "Resume from" field (reading from `msg.workflowId`)
    - The node automatically fetches the session ID and commit hash
    - If the previous workflow ran tasks, resume is enabled to skip completed work
    - If the workflow was cancelled before tasks ran, it relaunches from the start
6. **Monitor Resumed** - The resumed workflow is monitored for completion

## Setup

To use this example:

-   Configure all Seqera nodes with your Platform credentials
-   Set the launchpad name in the Launch workflow node
-   Configure the "Resume from" field to use `msg.workflowId` from the monitor output
-   Adjust parameters as needed
-   Click "Deploy" and trigger with the inject node

If your workflow succeeds on the first try, the resume logic won't be triggered. If it fails, the flow will automatically attempt to resume from the failure point.
