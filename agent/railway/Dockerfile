FROM node:20-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw

RUN mkdir -p /data/.openclaw /data/workspace

COPY agent/openclaw.json /app/openclaw.json
COPY agent/skills /app/skills

WORKDIR /app

ENV OPENCLAW_STATE_DIR=/data/.openclaw
ENV OPENCLAW_WORKSPACE_DIR=/data/workspace
ENV PORT=18789

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:18789/ || exit 1

CMD ["openclaw", "gateway", "--port", "18789", "--config", "/app/openclaw.json"]
