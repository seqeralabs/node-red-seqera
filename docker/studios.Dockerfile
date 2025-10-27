# Stage 1: Get the Seqera Connect client
ARG CONNECT_CLIENT_VERSION=0.8
FROM public.cr.seqera.io/platform/connect-client:${CONNECT_CLIENT_VERSION} AS connect

# Final image: Start from the official node-red image
FROM nodered/node-red:latest-debian

USER root

# Install extra dependencies and tools
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Connect binary and install dependencies
COPY --from=connect /usr/bin/connect-client /usr/bin/connect-client
RUN /usr/bin/connect-client --install

# Set connect as the entrypoint
ENTRYPOINT ["/usr/bin/connect-client", "--entrypoint"]

# Copy the local package first
COPY ./ /node-red-seqera/

# Copy package.json to the WORKDIR so npm builds all of your added nodes modules
WORKDIR /node-red-data
COPY ./docker/package.json /node-red-data
RUN npm install --unsafe-perm --no-update-notifier --no-fund --only=production

# Copy _your_ Node-RED project files into place
COPY ./docker/settings.js /node-red-data/settings.js
COPY ./docker/node-red-seqera.css /node-red-data/node-red-seqera.css
COPY ./docker/node-red-seqera.svg /node-red-data/node-red-seqera.svg
COPY ./docker/flows.json /node-red-data/flows.json

# Default command to run node-red
ENV LAST_MODIFIED="2025-05-16-01:55"
CMD ["/bin/bash", "-c", "node-red --userDir /node-red-data --port $CONNECT_TOOL_PORT"]
