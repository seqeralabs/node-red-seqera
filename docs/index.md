<h1>
<img src="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/logo.svg" alt="@seqera/node-red-seqera" class="only-light" width="90%">
<img src="https://github.com/seqeralabs/node-red-seqera/raw/main/docs/img/logo-dark.svg" alt="@seqera/node-red-seqera" class="only-dark" width="90%">
</h1>

# ![@seqera/node-red-seqera](img/logo.svg#only-light) ![@seqera/node-red-seqera](img/logo-dark.svg#only-dark)

**A set of Node-RED nodes for interacting with Seqera Platform.**

-   <img alt="Node-RED icon" src="img/github-icon.svg" width=15> GitHub: https://github.com/seqeralabs/node-red-seqera
-   <img alt="Node-RED icon" src="img/node-red-icon.svg" width=15> Node-RED Flows library: https://flows.nodered.org/node/@seqera/node-red-seqera
-   <img alt="npm icon" src="img/npm-icon.svg" width=15> npm package: https://www.npmjs.com/package/@seqera/node-red-seqera
-   <img alt="npm icon" src="img/favicon.svg" width=15> Seqera Platform: https://seqera.io/platform/

Gives new Node-RED node types for your automation workflows, which are designed to work together:

![@seqera/node-red-seqera nodes](img/nodes.png){ width=400 align=right}

-   [Launch a workflow](seqera_nodes/launch_workflow.md)
-   [Monitor a workflow](seqera_nodes/monitor_workflow.md)
-   [Add Dataset](seqera_nodes/add_dataset.md)
-   [List Files from Data Explorer](seqera_nodes/list_files.md)
-   [Poll Data Link Files](seqera_nodes/poll_files.md)
-   [Add a Seqera Studio](seqera_nodes/add_studio.md)
-   [Monitor a Seqera Studio](seqera_nodes/monitor_studio.md)

!!! warning

    This is an open-source project for community benefit. It is provided as-is and is not part of Seqera's officially supported toolset.

# Typical Use cases

-   🛠️ Integration with events _coming from_ and _going to_ **third-party services** (AWS, Slack, and [>5000 others](https://flows.nodered.org/search?type=node) supported by Node-RED)
-   🎨 Link triggers and actions to build automation logic using a **graphical builder**
-   🔗 **Chain workflows**, launching downstream automatically
-   🪩 _(Bonus)_ Use with [Home Assistant](https://community.home-assistant.io/t/home-assistant-community-add-on-node-red/55023) to make your office lights go into disco mode when a pipeline completes 🕺🏻 🎉

!!! tip

    This package includes several example flows which you can import and repurpose.
    **See the [example docs](examples/index.md) for more information.**

# License

Apache-2.0 license
