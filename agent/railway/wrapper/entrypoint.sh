#!/bin/bash
set -e

chown -R openclaw:openclaw /data

if [ ! -d /data/.linuxbrew ]; then
  cp -a /home/linuxbrew/.linuxbrew /data/.linuxbrew
fi

rm -rf /home/linuxbrew/.linuxbrew
ln -sfn /data/.linuxbrew /home/linuxbrew/.linuxbrew

# Copy agent config and skills into the workspace on first run
if [ ! -f /data/workspace/openclaw.json ] && [ -f /app/agent-config/openclaw.json ]; then
  mkdir -p /data/workspace
  cp /app/agent-config/openclaw.json /data/workspace/openclaw.json
  cp -r /app/agent-config/skills /data/workspace/skills
  chown -R openclaw:openclaw /data/workspace
fi

exec gosu openclaw node src/server.js
