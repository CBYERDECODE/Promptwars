# Multi-stage production build for ResQ AI on Google Cloud Run
# Stage 1: Build Shared and Frontend
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and package manifests
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Install all dependencies
RUN npm install

# Copy source trees
COPY packages/shared/ ./packages/shared/
COPY apps/backend/ ./apps/backend/
COPY apps/frontend/ ./apps/frontend/

# Build shared package
RUN npm run build -w @resq-ai/shared

# Build backend and frontend
RUN npm run build -w @resq-ai/backend
RUN npm run build -w @resq-ai/frontend

# Stage 2: Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package manifests for production install
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules

# Ensure data directories exist
RUN mkdir -p /app/apps/backend/data

EXPOSE 8080

CMD ["node", "apps/backend/dist/server.js"]
