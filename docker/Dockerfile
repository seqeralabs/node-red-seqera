# Final image: Start from the official node-red image
FROM nodered/node-red:latest-debian

# Copy the local package first
COPY ./ /node-red-seqera/

# Copy package.json and install dependencies
WORKDIR /node-red-data
COPY ./docker/package.json /node-red-data
RUN npm install --unsafe-perm --no-update-notifier --no-fund --only=production

# Custom settings, styling and flows
COPY ./docker/settings.js /node-red-data/settings.js
COPY ./docker/node-red-seqera.css /node-red-data/node-red-seqera.css
COPY ./docker/node-red-seqera.svg /node-red-data/node-red-seqera.svg
COPY ./docker/flows.json /node-red-data/flows.json

# Run Node-RED
ENTRYPOINT ["/bin/bash", "-c", "node-red --userDir /node-red-data"]
