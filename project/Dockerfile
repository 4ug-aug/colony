FROM oven/bun:1.3.5

ARG SWEAT_VERSION=dev

LABEL org.opencontainers.image.source="https://github.com/4ug-aug/sweat-v2" \
      org.opencontainers.image.version="$SWEAT_VERSION"

ENV OPENAI_AGENTS_DISABLE_TRACING=1

WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY roles /app/roles
COPY runtime /app/runtime

WORKDIR /work
