# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p database public

# Expose port 8083
EXPOSE 8083

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8083

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8083/api/wallets', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Run the application
CMD ["node", "server.js", "-c", "prod"] 