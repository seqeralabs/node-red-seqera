# Launch on file upload

`examples/02 - Launch on file upload.json`

![02 - Launch on file upload.json](../img/example_flow_02.png)

This flow uses the _Poll files_ node to periodically check for the presence
of a file called `RTAcomplete.txt` within a Seqera Data Link (eg. an s3 bucket).

These files are typically uploaded by illumina sequencers when base calling is complete.
But you could configure it to look for the upload of any file path.

When the file is detected, a _List files_ node is used to list all of the files within
that Data Link (bucket - could be configured to use the location that the `RTAcomplete.txt` file is found).

A Node-RED _Function_ node with some javascript then constructs a sample sheet from these filenames.
This is passed to the "Add Dataset" node, which saves it as a Seqera Platform Dataset.

Finally, this is passed to the _Launch workflow_ node, which fires off a pipeline run.

## Setup

Some configuration is needed to make this flow work:

-   All Seqera nodes need a Seqera configuration to be assigned
-   _Poll files_ and _List files_ need to be configured with the name of a Data Link within Platform
-   _Add dataset_ needs a dataset name to be set somehow (dynamically to avoid name clashes)
-   _Launch workflow_ needs configuring with the name of a Launchpad pipeline, and parameters.
