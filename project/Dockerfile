FROM oven/bun:1.3.5

ENV OPENAI_AGENTS_DISABLE_TRACING=1

WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY roles /app/roles
COPY runtime /app/runtime

WORKDIR /work
