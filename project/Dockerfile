FROM oven/bun:1.3.5

ARG SWEAT_VERSION=dev

LABEL org.opencontainers.image.source="https://github.com/4ug-aug/sweat-v2" \
      org.opencontainers.image.version="$SWEAT_VERSION"

ENV OPENAI_AGENTS_DISABLE_TRACING=1

WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends \
    git python3 python3-pip python3-venv python-is-python3 \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/pglite \
 && cd /opt/pglite \
 && bun add @electric-sql/pglite @electric-sql/pglite-socket \
 && printf '%s\n' '#!/bin/sh' 'exec bun /opt/pglite/node_modules/@electric-sql/pglite-socket/dist/scripts/server.js "$@"' > /usr/local/bin/pglite-server \
 && chmod +x /usr/local/bin/pglite-server
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY roles /app/roles
COPY runtime /app/runtime
COPY skills /app/skills

WORKDIR /work
