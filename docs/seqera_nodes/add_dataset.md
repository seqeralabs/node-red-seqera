---
title: Create Dataset
---

# Create Dataset

Create a new Dataset and upload its tabular contents in one step.

Datasets in Seqera Platform store tabular data (CSV/TSV files) that can be used as input to workflows, typically containing sample sheets or metadata.

## Inputs

- **datasetName** (required): Name of the Dataset to create.
- **fileContents** (required, default `msg.payload`): CSV/TSV content to upload. Can be a string or Buffer.
- **fileType** (default **csv**): Either `csv` or `tsv`. Determines the MIME type and file extension.
- **description**: Optional description for the Dataset.
- **workspaceId**: Override the workspace ID from the Config node.
- **baseUrl**: Override the Seqera API URL.

## Outputs

- `msg.payload` – API response from the upload request.
- `msg.datasetId` – ID of the newly-created Dataset.

## Configuration

### File format

The node supports two tabular formats:

- **CSV** (Comma-Separated Values): `text/csv`
- **TSV** (Tab-Separated Values): `text/tab-separated-values`

The file type determines the MIME type sent to the API and the file extension used.

### File contents

The **fileContents** field expects the complete file content as a string or Buffer. You can:

- Read from a file using the **file in** node
- Generate dynamically using a **function** node
- Pass through from a previous node via `msg.payload`

## Required permissions

Minimum required role: **Launch**

## Example usage

### Upload from file

1. Add a **file in** node and configure it to read your CSV file
2. Add a **create-dataset** node
3. Set **datasetName** to your desired name
4. Set **fileContents** to `msg.payload` (default)
5. Wire file in → create-dataset
6. Add a **debug** node to see the result
7. Deploy and trigger the file read

### Generate CSV dynamically

Use a **function** node to create CSV content:

```javascript
const data = [
  ["sample", "fastq_1", "fastq_2"],
  ["sample1", "s3://bucket/sample1_R1.fastq.gz", "s3://bucket/sample1_R2.fastq.gz"],
  ["sample2", "s3://bucket/sample2_R1.fastq.gz", "s3://bucket/sample2_R2.fastq.gz"],
];

msg.payload = data.map((row) => row.join(",")).join("\n");
msg.datasetName = "my-samples-" + new Date().toISOString().split("T")[0];

return msg;
```

Connect this function node to a **create-dataset** node with:

- **datasetName**: `msg.datasetName`
- **fileContents**: `msg.payload`

### Create dataset on file upload

See the [Launch on file upload example](../examples/02-launch-on-file-upload.md) for a complete flow that creates a dataset whenever a new file appears in a Data Link.

## Implementation details

The node performs two API calls:

1. `POST /datasets` – Creates the dataset entry
2. `POST /datasets/{id}/upload` – Uploads the file content using multipart/form-data

The upload uses the `form-data` package to construct the multipart request with the appropriate MIME type.

## Notes

- Dataset names must be unique within a workspace
- File size limits depend on your Seqera Platform configuration
- The uploaded file is validated by Seqera Platform (must be valid CSV/TSV)
- Custom message properties are preserved in the output (e.g., `msg._context`)
