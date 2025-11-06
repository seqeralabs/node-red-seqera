# Changelog

## [1.3.0] - 2025-11-06

-   New `mkdocs material` website with totally revamped and rewritten documentation
-   Breaking change! Renamed `create` to `add` to match Seqera Platform terminology
    -   Renamed `create-dataset` to `add-dataset`
    -   Renamed `create-studio` to `add-studio`
    -   Export your node as JSON, rename and reimport to fix your flows if needed

## [1.2.0] - 2025-10-27

-   Launch node: added ability to provide key/value pairs for params in the editor interface

## [1.1.0] - 2025-10-27

-   Added customizable run name field to workflow launch node [#8](https://github.com/seqeralabs/node-red-seqera/pull/8)
-   New example workflow: nf-core/rnaseq chained to nf-core/differentialabundance [#7](https://github.com/seqeralabs/node-red-seqera/pull/7)
-   Add checkbox to specify that dataset has a header row [#6](https://github.com/seqeralabs/node-red-seqera/pull/6)
-   Clarify required user permissions in Platform [#4](https://github.com/seqeralabs/node-red-seqera/pull/4)
-   Add ability to manually trigger a new docker image build [#2](https://github.com/seqeralabs/node-red-seqera/pull/2)

## [1.0.1] - 2025-06-18

-   Use two separate Docker image names for the vanilla and Studios images.
-   Bumped versions of npm dependencies

## [1.0.0] - 2025-06-18

-   Moved repository to [seqeralabs/node-red-seqera](https://github.com/seqeralabs/node-red-seqera)
-   Tidied up and updated `README.md`
-   Made a vanilla `Dockerfile` to run outside of Seqera Studios

## [0.3.3] - 2025-06-09

-   Datalink nodes: autocomplete datalinks, not datasets 🙈

## [0.3.2] - 2025-06-09

-   Add autocomplete for datalink name in datalink nodes
-   Fix Poll datalinks don't-run-if-not-configured thing

## [0.3.1] - 2025-06-08

-   Poll datalinks - don't run poll if node is not configured
-   Improve default flow for Studios container, showcase available nodes.
-   New simple example: launch + monitor.
-   🐛 Bugfix: Update examples to use refactored launch / monitor nodes
-   Update node screenshots for readme

## [0.3.0] - 2025-06-08

-   Refactored workflow nodes into separate `seqera-workflow-launch` and `seqera-workflow-monitor` nodes
-   Added autocomplete for launchpad names in workflow launch node
-   Added workspace dropdown to config node
-   Added in-dialogue API check to config node
-   Individual nodes can now override workspace ID from config
-   Improved poll duration inputs with time units
-   Added new custom icons for node types
-   Added Seqera styling to Node-RED editor
-   New example flows:
    -   Launch on file upload
    -   Studio on run fail + Slack webhook
-   Added `README.md` for examples and improved visibility in palette
-   Improved error handling and centralized API calls
-   🐛 Bugfix: Remove remnant `errMsg` variable causing crashes

## [0.2.3] - 2025-05-22

-   New nodes for Seqera Studios:
    -   `seqera-studios-add`
-   Set various node inputs to "required"
-   Improved common library of functions for calling API endpoints
-   Better error handling and reporting to the debug console
-   Removed `_seqera_request` and `_seqera_error` outputs

## [0.2.2] - 2025-05-21

-   Bugfix: Include package files in Docker image

## [0.2.1] - 2025-05-21

-   Updated Data Explorer nodes to include information about source bucket
    -   Detailed info in main `msg.payload`
    -   Prepended bucket name in `msg.files`

## [0.2.0] - 2025-05-18

-   Added new nodes for listing files in Data Explorer:
    -   `seqera-datalink-list`
    -   `seqera-datalink-poll`

## [0.1.2] - 2025-05-17

-   Added GitHub action to publish to npm from GitHub releases automatically
-   Added GitHub action to build and publish Docker images automatically

## [0.1.1] - 2025-05-17

-   Fixed bug: Prettier was indenting markdown which broke help text rendering.

## [0.1.0] - 2025-05-16

### Added

-   Initial release of the Node-RED Seqera integration.
-   Custom Node-RED nodes for Seqera workflows:
    -   `seqera-config`
    -   `seqera-dataset-add`
    -   `seqera-launch`
    -   `seqera-launch-monitor`
    -   `seqera-workflow`
-   Example flows and settings for Node-RED.
-   Documentation and project assets.
