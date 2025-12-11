# Poll files

**Periodically list a Seqera Data Explorer Data Link and emit messages when new or modified objects appear.**

This node automatically monitors a Data Link for _changes_, making it perfect for event-driven workflows that trigger when new files are uploaded or existing files are modified.

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
-   **Poll frequency** (default **15 min**): Interval between polls.
-   **Detection mode** (default **Name + metadata**): How to detect new files:
    -   **Name + metadata (detect changes)**: Detects files as new when name, lastModified, size, or etag changes. Use this when files are overwritten or replaced with the same name (e.g., daily status files).
    -   **Name only (detect new files)**: Only detects truly new filenames. Files with the same name are ignored after first detection (original behavior).
-   **Data Link name** (required): Display name of the Data Link. Supports autocomplete.
-   **Base path**: Path within the Data Link to start from.
-   **Prefix**: Prefix filter applied to both files and folders.
-   **Pattern**: Regular-expression filter applied to files after the prefix filter.
-   **Return type** (default **files**): `files`, `folders` or `all`.
-   **Max results** (default **100**): Maximum number of objects to return per poll.
-   **Depth** (default **0**): Folder recursion depth.
-   **Workspace ID**: Override the workspace ID from the Config node.

All properties work the same as the [list files](list_files.md) node, plus automatic polling.

## Outputs (three)

The node has three outputs that fire at different times:

1. **All results** – Emitted every poll with the full, filtered list of files.
2. **New or modified** – Emitted only when one or more _new or changed_ objects are detected since the last poll. Behavior depends on the detection mode:
    - **Name + metadata mode**: Fires when files are new OR when existing files have changed metadata (lastModified, size, or etag).
    - **Name only mode**: Fires only for truly new filenames that haven't been seen before.
3. **Deleted** – Emitted only when files that were present in the previous poll are no longer found in the current poll.

All messages include the same properties:

-   `msg.payload.files` – Array of file objects from the API.
-   `msg.payload.resourceType`, `msg.payload.resourceRef`, `msg.payload.provider` – Data Link metadata.
-   `msg.files` – Convenience array of fully-qualified object names (strings).
-   `msg.payload.nextPoll` (only on **All results** output) – ISO timestamp of the next scheduled poll.

## How new files are detected

The node tracks seen files in its internal state. On each poll:

1. Fetch the current list of files from the Data Link
2. Compare against the list from the previous poll
3. If new, modified, or deleted files are found, emit them on the appropriate outputs
4. Update the stored state for the next comparison

The comparison behavior depends on the **detection mode**:

### Name + metadata mode (default)

Files are identified by a combination of name, lastModified timestamp, size, and etag. A file is considered "new or modified" if:

-   It has a filename that wasn't seen before, OR
-   It has the same filename but different lastModified, size, or etag values

**Use case**: Daily status files, completion markers, or any files that are overwritten/replaced with the same name but should trigger on each update.

**Example**: A file named `RTAComplete.txt` is deposited every night with a new timestamp. Each deposit will trigger output 2.

### Name only mode

Files are identified by name only. A file is considered "new" only if:

-   It has a filename that wasn't seen before

Files with the same name are ignored after the first detection, regardless of any metadata changes.

**Use case**: Monitoring for truly new files where you don't care about modifications to existing files.

**Example**: Monitoring an upload directory where each sequencing run has a unique filename.

### Deletion detection (both modes)

Files are considered "deleted" when they were present in the previous poll but are not found in the current poll. This happens in both detection modes and fires on output 3.

!!! info

    The very first poll after the node is created sees everything as new and is handled as a special case. It does not output new results on output 2.

## Required permissions

Minimum required role: **Maintain**

See the [configuration documentation](configuration.md#required-token-permissions) for a full table of required permissions for all nodes.

## Example usage

### Launch workflow on new files

1. Add a **poll-files** node and configure the Data Link
2. Set **pollFrequency** to your desired interval (e.g., `5:00` for 5 minutes)
3. Set **Detection mode** based on your use case:
    - Use **Name + metadata** if files can be overwritten/replaced
    - Use **Name only** if all files have unique names
4. Connect output 2 (New or modified) to a **workflow-launch** node
5. Configure the launch node to use the file paths from `msg.files`
6. Deploy

Now every time a new or modified file appears in the Data Link, a workflow will automatically launch.

### Trigger only on specific file types

1. Set **pattern**: `.*\.bam$` to only detect BAM files
2. Connect output 2 to your processing logic
3. The node will only emit when new BAM files appear

### Monitor for status file updates

Use this pattern when a completion marker file is deposited with the same name but new timestamp:

1. Set **Detection mode** to **Name + metadata**
2. Set **Pattern**: `RTAComplete\.txt$` to match only the status file
3. Connect output 2 to your workflow trigger
4. Each time the file is deposited (even with the same name), the workflow will trigger

### Clean up on file deletion

Monitor for files being removed from a Data Link:

1. Configure the poll node as normal
2. Connect output 3 (Deleted) to a notification or cleanup workflow
3. When files disappear from the Data Link, the third output fires with the list of deleted files

## Notes

-   The first poll after deployment/restart does **not** emit to the "New or modified" output (output 2) – it initializes the tracking state
-   The tracking state is reset on each Node-RED restart or flow redeployment
-   Choose the appropriate **detection mode** for your use case:
    -   Use **Name + metadata** when files can be overwritten or replaced (e.g., status files, daily reports)
    -   Use **Name only** when all files have unique names and you don't care about modifications
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
