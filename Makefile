GUI := project/gui
SWEAT_DATABASE_PATH ?= $(abspath $(GUI)/sweat.sqlite)
ADMIN_EMAIL ?= admin@sweat.local
ADMIN_PASSWORD ?= change-me-now
MEMBER_EMAIL ?= teammate@sweat.local
MEMBER_PASSWORD ?= change-me-now
GUI_ORIGIN ?= http://localhost:3000
API_ORIGIN ?= http://localhost:3001

export SWEAT_DATABASE_PATH
export SWEAT_ADMIN_EMAIL := $(ADMIN_EMAIL)
export SWEAT_ADMIN_PASSWORD := $(ADMIN_PASSWORD)
export SWEAT_MEMBER_EMAIL := $(MEMBER_EMAIL)
export SWEAT_MEMBER_PASSWORD := $(MEMBER_PASSWORD)
export SWEAT_GUI_ORIGIN := $(GUI_ORIGIN)
export BETTER_AUTH_URL := $(API_ORIGIN)

.PHONY: dev admission-dev dev-seeded setup seed setup-token reset-admin-password agent gui coordinator build check reset

dev: setup agent
	@$(MAKE) --no-print-directory -j2 gui coordinator

admission-dev: setup
	@$(MAKE) --no-print-directory -j2 gui coordinator

dev-seeded: setup seed agent
	@$(MAKE) --no-print-directory -j2 gui coordinator

setup:
	@cd $(GUI) && bun run db:migrate

seed:
	@cd $(GUI) && bun run seed:admin

setup-token:
	@cd $(GUI) && bun run src/server/setup-token.ts

reset-admin-password:
	@test -n "$(PASSWORD)" || (echo 'Usage: make reset-admin-password PASSWORD=...'; exit 2)
	@cd $(GUI) && bun run src/server/reset-admin-password.ts "$(PASSWORD)"

agent:
	@cd project && bun run agent:build

gui:
	@cd $(GUI) && bun run dev

coordinator:
	@cd $(GUI) && bun --env-file=../.env.local --env-file=.env.local run coordinator

build:
	@cd $(GUI) && bun run build

check:
	@cd $(GUI) && bun run typecheck
	@cd $(GUI) && bun test
	@cd $(GUI) && bun run build

reset:
	@test "$(SWEAT_DATABASE_PATH)" != "/" && test "$(SWEAT_DATABASE_PATH)" != "" || (echo "Refusing to reset an unsafe database path"; exit 1)
	@rm -f -- "$(SWEAT_DATABASE_PATH)" "$(SWEAT_DATABASE_PATH)-shm" "$(SWEAT_DATABASE_PATH)-wal"
