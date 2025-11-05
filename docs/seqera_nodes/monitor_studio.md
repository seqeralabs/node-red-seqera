---
title: Monitor Studio
---

# Monitor Studio

Poll the status of an existing **Studio** session until it reaches a terminal state.

This node continuously monitors a Studio's status, allowing you to trigger automation when the Studio becomes ready or terminates.

## Inputs

- **studioId** (required, default: `msg.studioId`): ID of the Studio session to monitor.
- **workspaceId**: Override the workspace ID from the Config node.

## Configuration

- **keepPolling** (default **true**): Continue polling until the Studio reaches a terminal state (stopped, errored, or buildFailed).
- **pollInterval** (default **5 seconds**): Frequency of status checks. Can be configured in seconds, minutes, or hours.

## Outputs (three)

The monitor node has three separate outputs that fire at different times:

1. **All status checks** – Emitted on every poll regardless of state, for monitoring and logging.
2. **Ready to use** – Emitted **once** when the Studio status transitions to `running` (ready for connections).
3. **Terminated** – Emitted when the Studio is no longer running (`stopped`, `errored`, or `buildFailed`).

Each message contains:

- `msg.payload` – Full Studio object from the API, including `statusInfo` with current status details.
- `msg.studioId` – ID of the Studio session.

## Status Details

The Studio status progression typically follows this sequence:

- **starting** → Initial provisioning (yellow)
- **building** → Container image is being built (yellow)
- **running** → Studio is active and ready to use (blue) - **Output 2 fires here**
- **stopping** → Shutdown in progress (yellow)
- **stopped** → Successfully terminated (green) - **Output 3 fires here**
- **errored** → Runtime error occurred (red) - **Output 3 fires here**
- **buildFailed** → Container build failed (red) - **Output 3 fires here**

When **keepPolling** is disabled, the node performs a single status check and outputs the result immediately without waiting for terminal states.

**Tip:** Connect Output 2 to subsequent automation (e.g., send a Slack notification when Studio is ready). This output only fires once on the state transition to `running`, making it perfect for triggering actions without duplicate messages. Use Output 3 for cleanup or error handling.

## Required permissions

Minimum required role: **View**

## Example usage

### Simple monitoring

1. Add a **create-studio** node
2. Add a **monitor-studio** node
3. Wire create → monitor (the `msg.studioId` is passed automatically)
4. Add three **debug** nodes connected to each output
5. Deploy and trigger the creation

The monitor will poll every 5 seconds and show status updates.

### Send notification when ready

Connect output 2 to a notification service:

1. create-studio → monitor-studio
2. monitor-studio (output 2) → slack notification / email / etc.
3. This notifies users as soon as the Studio is accessible

Example function before notification:

```javascript
msg.payload = `Studio "${msg.payload.name}" is now ready! Connect at: ${msg.payload.connectUrl}`;
return msg;
```

### Handle termination

Connect output 3 for cleanup or error handling:

```javascript
if (msg.payload.statusInfo.status === "stopped") {
  // Normal shutdown - log success
  node.log("Studio stopped normally");
} else if (msg.payload.statusInfo.status === "errored") {
  // Handle error - send alert
  msg.payload = `Studio error: ${msg.payload.statusInfo.message}`;
  return msg;
} else if (msg.payload.statusInfo.status === "buildFailed") {
  // Container build failed - check image URI
  node.error("Studio build failed - check container image");
}
```

### Monitoring without continuous polling

To check Studio status just once:

1. Set **keepPolling** to `false`
2. The node performs a single status check and outputs immediately
3. Useful for scheduled health checks or manual queries

### Custom poll interval

For less frequent checks to reduce API calls:

1. Set **pollInterval** to `30` seconds or `1:00` minute
2. Appropriate for Studios with slow startup times
3. Balances responsiveness with API usage

## Implementation details

The node:

1. Makes periodic `GET /studios/{id}` API calls
2. Compares current status with previous status
3. Fires output 2 only on the transition to `running`
4. Stops polling when a terminal state is reached (if `keepPolling` is true)

## Notes

- Output 2 (Ready) is designed for triggering one-time actions when the Studio becomes available
- Output 1 (All checks) is useful for dashboards or logging every status check
- Output 3 (Terminated) handles both successful shutdown and error conditions
- All outputs preserve custom message properties from the input (e.g., `msg._context`)
- Very frequent polling (< 5 seconds) may impact API rate limits for large numbers of Studios
- The monitor automatically stops when terminal state is reached (unless `keepPolling` is false)

## Best practices

- Use output 2 for user notifications and triggering downstream workflows
- Use output 3 for cleanup tasks and error alerts
- Set poll interval based on typical startup time:
  - Fast-starting containers: 5-10 seconds
  - Large containers: 30-60 seconds
  - GPU instances: 60+ seconds (longer provision time)
- Always connect error handling to output 3 for production workflows

## See also

- [Create Studio](create_studio.md) – Create a new Studio
- [Studio + Slack webhook example](../examples/05-studio-slack-webhook.md) – Complete workflow with notifications
- [Seqera Studios documentation](https://docs.seqera.io/platform/latest/studios/overview)
