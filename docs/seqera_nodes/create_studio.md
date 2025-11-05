---
title: Create Studio
---

# Create Studio

Create a new **Studio** (interactive workspace) on Seqera Platform.

[Seqera Studios](https://docs.seqera.io/platform/latest/studios/overview) provide interactive development environments (like JupyterLab, RStudio, VS Code) running on cloud compute with access to your data.

## Inputs

- **studioName** (required): Display name for the Studio.
- **containerUri** (required): Container image URI for the Studio tool (e.g., `jupyter/datascience-notebook:latest`).
- **computeEnvId** (required): ID of the Compute Environment to run on.
- **description**: Optional text description for the Studio.
- **mountData**: One or more Data Link names to mount inside the Studio. These appear as accessible paths in the Studio environment.
- **cpu** (default **2**): Number of CPU cores.
- **memory** (default **8192**): Memory in MB.
- **gpu** (default **0**): Number of GPUs.
- **initialCheckpointId**: Checkpoint ID to restore from (for continuing previous work).
- **condaEnvironment**: Conda environment configuration.
- **lifespanHours**: Maximum lifetime before auto-stop (in hours).
- **isPrivate** (default **false**): Whether the Studio is private to the creator.
- **spot** (default **false**): Use spot/preemptible instances.
- **autoStart** (default **true**): Automatically start the Studio after creation.
- **workspaceId**: Override the workspace ID from the Config node.
- **baseUrl**: Override the Seqera API URL.

## Outputs

- `msg.payload` – Full API response from the Studio creation.
- `msg.studioId` – ID of the created Studio.

## Configuration

### Container image

The **containerUri** specifies the Docker/OCI container image to run. Common options:

- **JupyterLab**: `jupyter/datascience-notebook:latest`
- **RStudio**: `rocker/rstudio:latest`
- **VS Code**: `codercom/code-server:latest`

You can use any public container image or your own custom images stored in a container registry.

### Compute environment

The **computeEnvId** determines where the Studio runs. Create compute environments in the Seqera Platform UI under Compute Environments. The ID can be found in the URL or via the API.

### Resource allocation

Configure CPU, memory, and GPU resources based on your workload:

- **Light work** (data exploration): 2 CPU, 8GB memory
- **Standard analysis**: 4 CPU, 16GB memory
- **Heavy computation**: 8+ CPU, 32+ GB memory, GPUs as needed

### Mounting data

The **mountData** field accepts an array of Data Link names. Each mounted Data Link appears as a directory inside the Studio, allowing direct access to your cloud storage.

Example:

- Mount `my-data-link` → appears as `/workspace/my-data-link/` in the Studio

### Lifespan

Set **lifespanHours** to automatically stop the Studio after a certain time to control costs. For example:

- `4` = Stop after 4 hours
- `24` = Stop after 1 day
- `0` or empty = No automatic stop

## Required permissions

Minimum required role: **Maintain**

## Example usage

### Create a JupyterLab studio

1. Add an **inject** node to trigger creation
2. Add a **create-studio** node and configure:
   - **studioName**: `My Analysis Studio`
   - **containerUri**: `jupyter/datascience-notebook:latest`
   - **computeEnvId**: `your-compute-env-id`
   - **cpu**: `4`
   - **memory**: `16384`
   - **mountData**: `["my-datasets", "my-results"]`
3. Add a **debug** node to see the output
4. Deploy and click inject

### Create and monitor

Chain studio creation with monitoring:

1. inject → create-studio → monitor-studio
2. The `msg.studioId` is passed automatically from create to monitor
3. Connect monitor output 2 (Ready to use) to a notification node
4. Deploy

You'll be notified as soon as the Studio is ready to use.

### Dynamic configuration

Use a **function** node to set parameters dynamically:

```javascript
msg.studioName = `Analysis-${Date.now()}`;
msg.cpu = msg.requiresGPU ? 8 : 4;
msg.memory = msg.requiresGPU ? 32768 : 16384;
msg.gpu = msg.requiresGPU ? 1 : 0;
msg.mountData = ["shared-data", msg.userDataLink];
return msg;
```

Connect this to a create-studio node with fields set to their respective `msg` properties.

## Implementation details

The node makes a single API call:

- `POST /studios` – Creates the Studio with all configuration

The API returns immediately with the Studio ID. The Studio will begin provisioning in the background. Use the [Monitor Studio](monitor_studio.md) node to track when it's ready.

## Notes

- Studio names must be unique within a workspace
- Container images must be accessible from the compute environment
- Data Links must exist before mounting them
- Resource limits depend on your compute environment configuration
- Studios consume compute resources and incur costs while running
- Set `autoStart: false` if you want to manually start the Studio later
- Custom message properties are preserved in the output (e.g., `msg._context`)

## See also

- [Monitor Studio](monitor_studio.md) – Track Studio status
- [Studio + Slack webhook example](../examples/05-studio-slack-webhook.md) – Complete workflow with notifications
- [Seqera Studios documentation](https://docs.seqera.io/platform/latest/studios/overview)
