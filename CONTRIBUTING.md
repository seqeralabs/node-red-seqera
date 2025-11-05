# Contributing to node-red-seqera

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for setting up your development environment and contributing code.

## Development Setup

### Prerequisites

- Node.js >= 12.0.0
- Node-RED >= 2.0.0
- Git
- Python with pip for pre-commit hooks

### Clone the Repository

```bash
git clone https://github.com/seqeralabs/node-red-seqera.git
cd node-red-seqera
```

### Set Up pre-commit Hooks

This project uses [pre-commit](https://pre-commit.com/) hooks for code quality checks.

First, install pre-commit and initialise it within the cloned repo:

```bash
# Install pre-commit (requires Python)
pip install pre-commit

# Install the git hooks
pre-commit install
```

Now, every time you run `git commit`, a range of checks will run.
Formatting errors will be automatically corrected, just run `git add` and `git commit` again and they should pass.
You can also run `pre-commit run --all-files` at any time to run checks.

## Running Node-RED Locally

### Installing Node-RED

First, [download and install Node.js](https://nodejs.org/en/download) locally.

Then install Node-RED globally via npm:

```bash
npm install -g node-red
```

This will make the `node-red` command available globally on your system.
See the [Node-RED Getting Started guide](https://nodered.org/docs/getting-started/local) for more installation options and troubleshooting.

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
# Start Node-RED (command can be run anywhere)
node-red
```

Open your browser to `http://localhost:1880` to access the Node-RED editor.

### Reloading Changes

After making code changes:

- **JavaScript files (`.js`)**: Restart Node-RED
- **HTML files (`.html`)**: Refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)

## Docker Development

The project has two Docker images includeed, that bundle and customise a Node-RED installation and come with the Seqera nodes pre-installed.

### Directory Structure

```
docker/
├── Dockerfile          # Base Node-RED + Seqera nodes
├── Dockerfile.studios  # Optimized for Seqera Studios
└── settings.js         # Custom Node-RED configuration
```

### Building Images

Images are automatically built and published via GitHub actions.
However, if you would like to build and test locally, you can:

```bash
# Base image
docker build -f docker/Dockerfile -t node-red-seqera:latest .

# Studios image
docker build -f docker/Dockerfile.studios -t node-red-seqera-studios:latest-studios .
```

## Getting Help

- **Documentation**: Check `CLAUDE.md` for detailed architecture notes
- **Issues**: Search existing [GitHub issues](https://github.com/seqeralabs/node-red-seqera/issues)

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
