# Poll files

**Periodically list a Seqera Data Explorer Data Link and emit messages when new objects appear.**

This node automatically monitors a Data Link for _changes_, making it perfect for event-driven workflows that trigger when new files are uploaded.

!!! note

    The node starts polling as soon as the flow is deployed – it has **no message inputs**.

<figure markdown="span">
    ![poll files node](../img/poll_files_node.png){ width=400}
    ![poll files node edit panel](../img/poll_files_node_edit.png){ width=600}
</figure>

## Configuration

!!! info

    This node works much like the [list files node](list_files.md), but instead of triggering when recieving a message input, it polls repeatedly and outputs events when it detects a change.

-   **Seqera config**: Reference to the seqera-config node containing API credentials and default workspace settings.
-   **Node name**: Optional custom name for the node in the editor.
-   **Data Link name** (required): Display name of the Data Link. Supports autocomplete.
-   **Base path**: Path within the Data Link to start from.
-   **Prefix**: Prefix filter applied to both files and folders.
-   **Pattern**: Regular-expression filter applied to files after the prefix filter.
-   **Return type** (default **files**): `files`, `folders` or `all`.
-   **Max results** (default **100**): Maximum number of objects to return per poll.
-   **Depth** (default **0**): Folder recursion depth.
-   **Poll frequency** (default **15 min**): Interval between polls.
-   **Output all results on every poll** (default **off**): When enabled, adds a second output that emits all files on every poll.
-   **Workspace ID**: Override the workspace ID from the Config node.

All properties work the same as the [list files](list_files.md) node, plus automatic polling.

## Outputs

By default, the node has a single output:

1. **New results** – Emitted only when one or more _new_ objects are detected since the last poll.

When **Output all results on every poll** is enabled, the node has two outputs:

1. **All results** – Emitted every poll with the full, filtered list of files.
2. **New results** – Emitted only when one or more _new_ objects are detected since the last poll.

Both outputs include the same properties:

-   `msg.payload.files` – Array of file objects from the API.
-   `msg.payload.resourceType`, `msg.payload.resourceRef`, `msg.payload.provider` – Data Link metadata.
-   `msg.files` – Convenience array of fully-qualified object names (strings).
-   `msg.payload.nextPoll` (only on **All results** output) – ISO timestamp of the next scheduled poll.
-   `msg.payload.pollIntervalSeconds` (only on **All results** output) – Poll interval duration in seconds.

## How new files are detected

The node tracks seen files in its context storage. On each poll:

1. Fetch the current list of files from the Data Link
2. Compare against the list from the previous poll
3. If new files are found, emit them on the "New results" output
4. Update the stored list for the next comparison

The comparison is based on the full file path. Files that are deleted and re-uploaded will be detected as "new".

!!! info

    The very first poll after the node is created sees everything as new and is handled as a special case. It does not output new results.

## Required permissions

Minimum required role: **Maintain**

See the [configuration documentation](configuration.md#required-token-permissions) for a full table of required permissions for all nodes.

## Example usage

### Launch workflow on new files

1. Add a **poll-files** node and configure the Data Link
2. Set **pollFrequency** to your desired interval (e.g., `5:00` for 5 minutes)
3. Connect the output (New results) to a **workflow-launch** node
4. Configure the launch node to use the file paths from `msg.files`
5. Deploy

Now every time a new file appears in the Data Link, a workflow will automatically launch.

### Trigger only on specific file types

1. Set **pattern**: `.*\.bam$` to only detect BAM files
2. Connect the output to your processing logic
3. The node will only emit when new BAM files appear

## Notes

-   The first poll after deployment/restart does **not** emit to the "New results" output (it initializes the tracking state)
-   The tracking is reset on each Node-RED restart or flow redeployment
-   Very frequent polling (< 30 seconds) may impact API rate limits
-   Custom message properties are preserved in outputs (e.g., `msg._context`)
-   Large Data Links with deep recursion may take time to process on each poll

### Best practices

-   Set **pollFrequency** based on how quickly you need to respond to new files
    -   For near-real-time: `30` seconds to `2` minutes
    -   For batch processing: `15` minutes to `1` hour
    -   For daily checks: `24` hours
-   Use **prefix** to narrow the search space and reduce API calls
-   Set **maxResults** high enough to capture all expected files per poll
-   Consider the trade-off between poll frequency and API usage

## See also

-   [List Files from Data Explorer](list_files.md) – One-time file listing
-   [Launch on file upload example](../examples/02-launch-on-file-upload.md) – Complete flow using this node
