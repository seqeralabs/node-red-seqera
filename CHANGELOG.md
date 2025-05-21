# Changelog

## [0.2.2] - 2025-05-21

- Bugfix: Include package files in Docker image

## [0.2.1] - 2025-05-21

- Updated Data Explorer nodes to include information about source bucket
  - Detailed info in main `msg.payload`
  - Prepended bucket name in `msg.files`

## [0.2.0] - 2025-05-18

- Added new nodes for listing files in Data Explorer:
  - `seqera-datalink-list`
  - `seqera-datalink-poll`

## [0.1.2] - 2025-05-17

- Added GitHub action to publish to npm from GitHub releases automatically
- Added GitHub action to build and publish Docker images automatically

## [0.1.1] - 2025-05-17

- Fixed bug: Prettier was indenting markdown which broke help text rendering.

## [0.1.0] - 2025-05-16

### Added

- Initial release of the Node-RED Seqera integration.
- Custom Node-RED nodes for Seqera workflows:
  - `seqera-config`
  - `seqera-dataset-create`
  - `seqera-launch`
  - `seqera-launch-monitor`
  - `seqera-workflow`
- Example flows and settings for Node-RED.
- Documentation and project assets.
