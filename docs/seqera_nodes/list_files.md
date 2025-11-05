---
title: List Files from Data Explorer
---

# List Files from Data Explorer

Retrieve objects from a Seqera **Data Explorer** link (Data Link).

Data Links provide a way to browse and access files in cloud storage (S3, Azure Blob, Google Cloud Storage, etc.) through the Seqera Platform. This node lists files and folders within a Data Link, with filtering and recursion options.

## Inputs

-   **dataLinkName** (required): Display name of the Data Link. Supports autocomplete in the node editor.
-   **basePath**: Path within the Data Link to start from (optional).
-   **prefix**: Prefix filter applied to both files and folders.
-   **pattern**: Regular-expression filter applied to files _after_ the prefix filter.
-   **returnType** (default **files**): `files`, `folders` or `all`.
-   **maxResults** (default **100**): Maximum number of objects to return.
-   **depth** (default **0**): Folder recursion depth (`0` = current directory only, negative = unlimited).
-   **workspaceId**: Override the workspace ID from the Config node.
-   **baseUrl**: Override the Seqera API URL.

## Outputs

-   `msg.payload.files` – Array of objects returned by the API (after filtering).
-   `msg.payload.resourceType` – Type of the Data Link resource.
-   `msg.payload.resourceRef` – Reference ID of the Data Link.
-   `msg.payload.provider` – Cloud provider (e.g., "aws", "azure", "google").
-   `msg.files` – Convenience array containing fully-qualified object names (strings only).

## Configuration

### Data Link name

The **dataLinkName** field supports autocomplete. Start typing to see available Data Links in your workspace.

### Filtering

The node provides two filtering mechanisms:

1. **Prefix filter**: Applied to both files and folders. Useful for narrowing to a specific subdirectory or file prefix.
2. **Pattern filter**: Regular expression applied only to files after the prefix filter. Useful for selecting specific file types or naming patterns.

Example:

-   Prefix: `samples/batch1/`
-   Pattern: `.*\.fastq\.gz$`
-   Result: Only `.fastq.gz` files in the `samples/batch1/` directory

### Return type

Choose what objects to return:

-   **files**: Only files (no directories)
-   **folders**: Only directories (no files)
-   **all**: Both files and directories

### Recursion depth

Control how deep to search subdirectories:

-   `0`: Current directory only (no recursion)
-   `1`: Current directory plus one level of subdirectories
-   `2`, `3`, etc.: Multiple levels of recursion
-   `-1`: Unlimited recursion (search all subdirectories)

!!! warning
Setting depth to `-1` with a large Data Link can result in many API calls and long processing time. Use with caution.

## Required permissions

Minimum required role: **Maintain**

## Example usage

### List all CSV files

1. Add an **inject** node to trigger the listing
2. Add a **list-files** node
3. Configure:
    - **dataLinkName**: Your Data Link name
    - **pattern**: `.*\.csv$`
    - **returnType**: `files`
4. Add a **debug** node to see the results
5. Deploy and click inject

### List files in subdirectory

1. Set **basePath**: `data/2024/january/`
2. Set **depth**: `0`
3. This will list only files directly in that subdirectory

### Recursive search for FASTQ files

1. Set **pattern**: `.*\.fastq(\.gz)?$`
2. Set **depth**: `-1`
3. Set **maxResults**: `1000` (or appropriate limit)
4. This will recursively find all FASTQ files in the Data Link

### Process results in a loop

Use a **split** node after the list-files node:

1. list-files → split (set to `msg.files`)
2. split → your processing logic (runs once per file)
3. Each iteration receives one file path in `msg.payload`

## Implementation details

The node makes two API calls:

1. `GET /data-links` – Fetch the Data Link by name to get its resource details
2. `GET /data-browser` – Browse the Data Link contents with filters

The filtering and recursion logic is implemented in the node to handle the depth-first traversal and regex pattern matching.

## Notes

-   Data Link names must match exactly (case-sensitive)
-   The `msg.files` convenience array contains just the file/folder paths as strings
-   The `msg.payload.files` array contains full objects with metadata (size, lastModified, etc.)
-   Custom message properties are preserved in the output (e.g., `msg._context`)
-   Large directories with many files may take time to process with deep recursion

## See also

-   [Poll Data Link Files](poll_files.md) – Automatically monitor a Data Link for new files
-   [Launch on file upload example](../examples/02-launch-on-file-upload.md)
