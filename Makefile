GUI := project/gui
ROOT_ENV := $(CURDIR)/.env.local
ENV_FILE ?= $(ROOT_ENV)
BUN_ENV = --env-file="$(ENV_FILE)"
SWEAT_DATABASE_PATH ?= $(abspath $(GUI)/sweat.sqlite)

export SWEAT_DATABASE_PATH

.DEFAULT_GOAL := help
.PHONY: help env dev dev-seeded server service-install service-upgrade service-uninstall migrate setup seed rotate-setup-token reset-admin-password agent gui coordinator test build check reset

help:
	@echo "Sweat development commands"
	@echo "  make dev                   Start the full stack with first-user setup"
	@echo "  make dev-seeded            Start the full stack with reusable local accounts"
	@echo "  make server                Start the complete backend for a separate client"
	@echo "  make service-install       Run the server in the background on Linux"
	@echo "  make service-upgrade       Pull, refresh deps, and restart the Linux background server"
	@echo "  make service-uninstall     Remove the Linux background server"
	@echo "  make gui                   Start only the browser client"
	@echo "  make test                  Run tests"
	@echo "  make check                 Run typecheck, tests, and production build"
	@echo "  make setup                 Configure a server or install the macOS app"
	@echo "  make rotate-setup-token    Replace a lost first-user setup token"
	@echo "  make reset-admin-password  Prompt for a new administrator password"
	@echo "  make reset                 Delete the local development database"
	@echo ""
	@echo "Configuration: $(ENV_FILE)"

env:
	@if test -f "$(ENV_FILE)"; then \
		:; \
	elif test "$(ENV_FILE)" != "$(ROOT_ENV)"; then \
		echo "Missing ENV_FILE: $(ENV_FILE)"; exit 2; \
	elif test -f "$(GUI)/.env.local"; then \
		cp "$(GUI)/.env.local" "$(ROOT_ENV)"; \
		echo "Created .env.local from the legacy GUI environment."; \
	elif test -f "project/.env.local"; then \
		cp "project/.env.local" "$(ROOT_ENV)"; \
		echo "Created .env.local from the legacy project environment."; \
		echo "Add BETTER_AUTH_SECRET before using a persistent workspace."; \
		exit 2; \
	else \
		cp ".env.example" "$(ROOT_ENV)"; \
		echo "Created .env.local. Run make setup to configure it."; \
		exit 2; \
	fi

# Local builds beat GHCR: published agent images are linux/amd64 only today.
DEV_AGENT_IMAGE := sweat-agent:latest
DEV_CURSOR_AGENT_IMAGE := sweat-agent-cursor:latest

dev: migrate agent
	@SWEAT_AGENT_IMAGE=$(DEV_AGENT_IMAGE) SWEAT_CURSOR_AGENT_IMAGE=$(DEV_CURSOR_AGENT_IMAGE) \
		$(MAKE) --no-print-directory -j2 gui coordinator

dev-seeded: seed agent
	@SWEAT_AGENT_IMAGE=$(DEV_AGENT_IMAGE) SWEAT_CURSOR_AGENT_IMAGE=$(DEV_CURSOR_AGENT_IMAGE) \
		$(MAKE) --no-print-directory -j2 gui coordinator

server: migrate agent
	@SWEAT_AGENT_IMAGE=$(DEV_AGENT_IMAGE) SWEAT_CURSOR_AGENT_IMAGE=$(DEV_CURSOR_AGENT_IMAGE) \
		$(MAKE) --no-print-directory coordinator

service-install: env
	@ENV_FILE="$(ENV_FILE)" bun scripts/service.ts install

service-upgrade: env
	@git pull --ff-only
	@bun install --frozen-lockfile
	@bun install --cwd project --frozen-lockfile
	@bun install --cwd project/gui --frozen-lockfile
	@ENV_FILE="$(ENV_FILE)" bun scripts/service.ts install

service-uninstall:
	@ENV_FILE="$(ENV_FILE)" bun scripts/service.ts uninstall

migrate: env
	@cd $(GUI) && bun $(BUN_ENV) run db:migrate

setup:
	@bun install --frozen-lockfile
	@ENV_FILE="$(ENV_FILE)" bun scripts/setup.ts

seed: migrate
	@cd $(GUI) && bun $(BUN_ENV) run seed:admin

rotate-setup-token: env
	@cd $(GUI) && bun $(BUN_ENV) run src/server/rotate-setup-token.ts

reset-admin-password: env
	@if test -z "$${SWEAT_NEW_ADMIN_PASSWORD:-}"; then \
		test -t 0 || (echo "SWEAT_NEW_ADMIN_PASSWORD is required without an interactive terminal"; exit 2); \
		printf "New administrator password: "; \
		stty -echo; \
		trap 'stty echo' EXIT HUP INT TERM; \
		IFS= read -r SWEAT_NEW_ADMIN_PASSWORD; \
		stty echo; \
		trap - EXIT HUP INT TERM; \
		printf "\n"; \
		export SWEAT_NEW_ADMIN_PASSWORD; \
	fi; \
	cd $(GUI) && bun $(BUN_ENV) run src/server/reset-admin-password.ts

agent: env
	@provider="$${SWEAT_SANDBOX_PROVIDER:-$$(sed -n 's/^SWEAT_SANDBOX_PROVIDER=//p' "$(ENV_FILE)" | tail -n 1)}"; \
	provider="$${provider#\"}"; provider="$${provider%\"}"; \
	case "$$provider" in \
		apple-container) \
			cd project && bun $(BUN_ENV) run agent:build && bun $(BUN_ENV) run agent:build:cursor ;; \
		docker) \
			docker build -t $(DEV_AGENT_IMAGE) project && \
			docker build -f project/Dockerfile.cursor -t $(DEV_CURSOR_AGENT_IMAGE) project ;; \
		*) echo "SWEAT_SANDBOX_PROVIDER must be set to one of: apple-container, docker"; exit 2 ;; \
	esac

gui: env
	@cd $(GUI) && bun $(BUN_ENV) run dev

coordinator: env
	@cd $(GUI) && bun $(BUN_ENV) run coordinator

build: env
	@cd $(GUI) && bun $(BUN_ENV) run build

test:
	@cd $(GUI) && bun test

check: env test
	@cd project && bun run typecheck
	@cd $(GUI) && bun run typecheck
	@cd $(GUI) && bun $(BUN_ENV) run build

reset:
	@case "$(SWEAT_DATABASE_PATH)" in "$(CURDIR)/$(GUI)/"*) ;; *) echo "Refusing to reset a database outside $(GUI)"; exit 1;; esac; \
	rm -f -- "$(SWEAT_DATABASE_PATH)" "$(SWEAT_DATABASE_PATH)-shm" "$(SWEAT_DATABASE_PATH)-wal"; \
	rm -rf -- "$(dir $(SWEAT_DATABASE_PATH))attachments"
