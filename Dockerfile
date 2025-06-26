# Use the official Node.js slim image
FROM node:18-slim

# Install Chromium
RUN apt-get update && \
    apt-get install -y chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set environment variable so puppeteer-core can find Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the working directory
WORKDIR /app

# Copy project files
COPY package*.json ./
COPY . .

# Install dependencies
RUN npm install --legacy-peer-deps

# Expose the port your app uses (e.g., 3000)
EXPOSE 3000

# Start the app
CMD [ "node", "index.js" ]
