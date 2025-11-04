# Contributing to node-red-seqera

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for setting up your development environment and contributing code.

## Table of Contents

- [Development Setup](#development-setup)
- [Running Node-RED Locally](#running-node-red-locally)
- [Docker Development](#docker-development)
- [Getting Help](#getting-help)
- [License](#license)

## Development Setup

### Prerequisites

- Node.js >= 12.0.0
- Node-RED >= 2.0.0
- Git
- (Optional) Python 3 with pip for pre-commit hooks

### Clone the Repository

```bash
git clone https://github.com/seqeralabs/node-red-seqera.git
cd node-red-seqera
```

### Install Dependencies

```bash
npm install
```

### Set Up Pre-commit Hooks (Optional but Recommended)

This project uses pre-commit hooks for code quality checks:

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Install the git hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

## Running Node-RED Locally

### Installing Node-RED

If you don't already have Node-RED installed, you can install it globally via npm:

```bash
npm install -g node-red
```

This will make the `node-red` command available globally on your system. See the [Node-RED Getting Started guide](https://nodered.org/docs/getting-started/local) for more installation options and troubleshooting.

### Installing the Package for Development

The easiest way to test your changes is to install the package locally in your Node-RED user directory;

```bash
# From the node-red-seqera directory
npm link

# Navigate to your Node-RED user directory
cd ~/.node-red

# Link the package
npm link @seqera/node-red-seqera
```

Now restart Node-RED, and any changes you make to the code will be immediately reflected (you may need to restart Node-RED to see changes).

See [official npm-link docs](https://docs.npmjs.com/cli/v8/commands/npm-link) for details.

### Starting Node-RED

```bash
# Start Node-RED
node-red

# Or if installed globally
npm start
```

Open your browser to `http://localhost:1880` to access the Node-RED editor.

### Reloading Changes

After making code changes:

- **JavaScript files (`.js`)**: Restart Node-RED
- **HTML files (`.html`)**: Refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)

### Running Linters Manually

The project uses [pre-commit](https://pre-commit.com/).

```bash
# First run
pre-commit install

# Optional: Run all pre-commit checks
pre-commit run --all-files

# Optional: Run on specific files
pre-commit run --files nodes/workflow-launch.js
```

## Docker Development

### Directory Structure

```
docker/
├── Dockerfile          # Base Node-RED + Seqera nodes
├── Dockerfile.studios  # Optimized for Seqera Studios
└── settings.js         # Custom Node-RED configuration
```

### Building Images

```bash
# Base image
docker build -f docker/Dockerfile -t ghcr.io/seqeralabs/node-red-seqera:latest .

# Studios image
docker build -f docker/Dockerfile.studios -t ghcr.io/seqeralabs/node-red-seqera-studios:latest .
```

## Getting Help

- **Documentation**: Check [CLAUDE.md](CLAUDE.md) for detailed architecture notes
- **Issues**: Search existing [GitHub issues](https://github.com/seqeralabs/node-red-seqera/issues)

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
