# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN NODE_OPTIONS="--max-old-space-size=1536" npx tsc

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# poppler-utils provides pdftotext for bank statement PDF parsing
RUN apk add --no-cache poppler-utils

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/src/database/init.sql ./dist/database/init.sql
COPY --from=frontend-build /app/frontend/dist ./dist/public

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/index.js"]
