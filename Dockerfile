ARG NODE_BASE=node:20-alpine
FROM ${NODE_BASE} AS frontend-build

WORKDIR /app

COPY packages/board-render/ packages/board-render/
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

COPY frontend/ frontend/
RUN npm --prefix packages/board-render run build
# The repository-wide committed-media guard runs before this image build. The
# Docker context intentionally has no Git metadata or Git executable, so this
# stage builds the frontend and then checks only the packaged output.
RUN cd frontend && npm exec -- vite build && \
    node scripts/check-no-committed-media.mjs --built-output-only
# DOM-free engine bundle for the headless training Job (backend/train-worker.mjs).
RUN npm --prefix frontend run build:trainer

FROM ${NODE_BASE}

WORKDIR /app

COPY packages/board-render/package*.json packages/board-render/
COPY --from=frontend-build /app/packages/board-render/dist packages/board-render/dist
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

COPY backend/ backend/
COPY --from=frontend-build /app/frontend/dist frontend/dist
COPY --from=frontend-build /app/frontend/trainer-bundle frontend/trainer-bundle

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /var/run/chess-tactics-hot /var/run/chess-tactics-static-override && \
    chown -R nodejs:nodejs /app /var/run/chess-tactics-hot /var/run/chess-tactics-static-override
USER nodejs

ENV HOT_BACKEND_DIR=/var/run/chess-tactics-hot \
    STATIC_FRONTEND_DIR=/var/run/chess-tactics-static-override \
    FRONTEND_DIR=/app/frontend/dist \
    NODE_PATH=/app/backend/node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1))"

CMD ["node", "backend/supervisor.js"]
