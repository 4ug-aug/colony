FROM oven/bun:1.3.5

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY roles /app/roles
COPY runtime /app/runtime

WORKDIR /work
