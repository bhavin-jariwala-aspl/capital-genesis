# =============================================================================
# Genesis CRM — one command for the whole dev stack.
#
#   make start     start backend + frontend in the background, wait until both answer
#   make stop      stop both (pid tree first, then anything still holding the ports)
#   make restart   stop, then start
#   make status    what is running, on which ports, and whether the database answers
#   make logs      follow both logs (Ctrl-C detaches; the servers keep running)
#   make dev       run both in the foreground instead (Ctrl-C stops both)
#
# PID files and logs live in .dev/ (git-ignored). The backend port is read from
# backend/.env so stop/status target the port the server actually listens on;
# both ports can be overridden per invocation:
#
#   make start BACKEND_PORT=4001 FRONTEND_PORT=5174
#
# Requires node, npm and lsof. Written for the macOS system make (GNU Make 3.81)
# as well as GNU Make 4.x, so there is no .ONESHELL / .RECIPEPREFIX here: each
# recipe is one shell command joined with backslashes. Do not put `#` comments
# inside those joined lines — the backslash-newline is removed before the shell
# tokenises, so a comment would swallow the rest of the recipe.
# =============================================================================

SHELL := /bin/bash

ROOT         := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BACKEND_DIR  := $(ROOT)/backend
FRONTEND_DIR := $(ROOT)/frontend
RUN_DIR      := $(ROOT)/.dev

# The server reads PORT from backend/.env through dotenv. Read it the same way
# so `make stop` kills the right listener when someone has changed it.
ENV_PORT      := $(shell sed -n -E 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*"?([0-9]{1,5})"?.*/\1/p' $(BACKEND_DIR)/.env 2>/dev/null | tail -1)
BACKEND_PORT  ?= $(if $(ENV_PORT),$(ENV_PORT),3001)
FRONTEND_PORT ?= 5173

# The backend retries the database with exponential backoff (~60s worst case)
# before it starts listening, so readiness has to allow for a slow database.
WAIT_SECONDS ?= 90

BACKEND_PID  := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid
BACKEND_LOG  := $(RUN_DIR)/backend.log
FRONTEND_LOG := $(RUN_DIR)/frontend.log

# npm spawns nodemon, which spawns node — so killing only the pid we recorded
# leaves the real server holding the port. Kill the whole tree, children first.
KILL_TREE = kill_tree() { if command -v pgrep >/dev/null 2>&1; then for c in $$(pgrep -P "$$1" 2>/dev/null); do kill_tree "$$c"; done; fi; kill "$$1" 2>/dev/null || true; };

# Free a port: SIGTERM a few times, then SIGKILL. Authoritative, because the
# listener is what actually matters and it survives a lost pid file.
FREE_PORT = free_port() { for i in 1 2 3 4 5 6; do pids=$$(lsof -ti tcp:"$$1" 2>/dev/null || true); if [ -z "$$pids" ]; then return 0; fi; if [ "$$i" -le 3 ]; then kill $$pids 2>/dev/null || true; else kill -9 $$pids 2>/dev/null || true; fi; sleep 1; done; return 1; };

.DEFAULT_GOAL := help
.PHONY: help start stop restart status logs logs-backend logs-frontend dev install test build clean

help:
	@printf "\nGenesis CRM — dev stack\n\n"
	@printf "  \033[1mmake start\033[0m      backend (:$(BACKEND_PORT)) + frontend (:$(FRONTEND_PORT)) in the background\n"
	@printf "  \033[1mmake stop\033[0m       stop both\n"
	@printf "  \033[1mmake restart\033[0m    stop, then start\n"
	@printf "  \033[1mmake status\033[0m     what is running right now\n"
	@printf "  \033[1mmake logs\033[0m       follow both logs (Ctrl-C detaches, servers keep running)\n"
	@printf "  \033[1mmake dev\033[0m        run both in the foreground (Ctrl-C stops both)\n\n"
	@printf "  make install     npm install in backend and frontend\n"
	@printf "  make test        backend (jest) + frontend (vitest) suites\n"
	@printf "  make build       production build of the frontend\n"
	@printf "  make clean       remove .dev/ logs and pid files\n\n"
	@printf "  Override ports:  make start BACKEND_PORT=4001 FRONTEND_PORT=5174\n\n"

# ── start ────────────────────────────────────────────────────────────────────
# Idempotent: a service we already started is left alone, while a stale listener
# from a crashed run (or a `nodemon` that outlived its child) is cleared first.
start:
	@if [ ! -d "$(BACKEND_DIR)/node_modules" ] || [ ! -d "$(FRONTEND_DIR)/node_modules" ]; then \
	  echo "  dependencies are not installed — run: make install"; exit 1; \
	fi; \
	if [ ! -f "$(BACKEND_DIR)/.env" ]; then \
	  echo "  backend/.env is missing — copy backend/.env.example and set DATABASE_URL"; exit 1; \
	fi; \
	mkdir -p "$(RUN_DIR)"; \
	if [ -f "$(BACKEND_PID)" ] && kill -0 "$$(cat "$(BACKEND_PID)")" 2>/dev/null; then \
	  echo "  backend    already running (pid $$(cat "$(BACKEND_PID)"))"; \
	else \
	  stale=$$(lsof -ti tcp:$(BACKEND_PORT) 2>/dev/null || true); \
	  if [ -n "$$stale" ]; then echo "  backend    clearing a stale listener on :$(BACKEND_PORT)"; kill -9 $$stale 2>/dev/null || true; sleep 1; fi; \
	  ( cd "$(BACKEND_DIR)" && PORT=$(BACKEND_PORT) exec nohup npm run dev ) >"$(BACKEND_LOG)" 2>&1 & \
	  echo $$! >"$(BACKEND_PID)"; \
	  echo "  backend    starting on :$(BACKEND_PORT)"; \
	fi; \
	if [ -f "$(FRONTEND_PID)" ] && kill -0 "$$(cat "$(FRONTEND_PID)")" 2>/dev/null; then \
	  echo "  frontend   already running (pid $$(cat "$(FRONTEND_PID)"))"; \
	else \
	  stale=$$(lsof -ti tcp:$(FRONTEND_PORT) 2>/dev/null || true); \
	  if [ -n "$$stale" ]; then echo "  frontend   clearing a stale listener on :$(FRONTEND_PORT)"; kill -9 $$stale 2>/dev/null || true; sleep 1; fi; \
	  ( cd "$(FRONTEND_DIR)" && exec nohup npm run dev -- --port $(FRONTEND_PORT) --strictPort ) >"$(FRONTEND_LOG)" 2>&1 & \
	  echo $$! >"$(FRONTEND_PID)"; \
	  echo "  frontend   starting on :$(FRONTEND_PORT)"; \
	fi; \
	printf "  waiting"; \
	ok=0; \
	for i in $$(seq 1 $(WAIT_SECONDS)); do \
	  b=$$(lsof -ti tcp:$(BACKEND_PORT) 2>/dev/null || true); \
	  f=$$(lsof -ti tcp:$(FRONTEND_PORT) 2>/dev/null || true); \
	  if [ -n "$$b" ] && [ -n "$$f" ]; then ok=1; break; fi; \
	  if [ -f "$(BACKEND_PID)" ] && ! kill -0 "$$(cat "$(BACKEND_PID)")" 2>/dev/null && [ -z "$$b" ]; then break; fi; \
	  if [ -f "$(FRONTEND_PID)" ] && ! kill -0 "$$(cat "$(FRONTEND_PID)")" 2>/dev/null && [ -z "$$f" ]; then break; fi; \
	  printf "."; sleep 1; \
	done; \
	printf "\n\n"; \
	if [ "$$ok" = "1" ]; then \
	  health=$$(curl -s -m 3 "http://localhost:$(BACKEND_PORT)/health" 2>/dev/null || true); \
	  case "$$health" in \
	    *'"status":"ok"'*)   db="database connected";; \
	    *degraded*)          db="database unreachable — the app runs in degraded mode";; \
	    *)                   db="health endpoint did not answer yet";; \
	  esac; \
	  printf "  Open        http://localhost:$(FRONTEND_PORT)\n"; \
	  printf "  API         http://localhost:$(BACKEND_PORT)  (%s)\n" "$$db"; \
	  printf "  Logs        make logs        Stop  make stop\n\n"; \
	else \
	  printf "  One of the services did not come up. Last lines:\n\n"; \
	  tail -n 15 "$(BACKEND_LOG)" "$(FRONTEND_LOG)" 2>/dev/null; \
	  printf "\n  Full logs: make logs\n\n"; exit 1; \
	fi

# ── stop ─────────────────────────────────────────────────────────────────────
# Two passes, because either alone leaves something behind: the pid tree catches
# a `nodemon` whose child already died (it would restart the server on the next
# file save), and the port sweep catches a listener whose pid file is gone.
stop:
	@$(KILL_TREE) $(FREE_PORT) \
	for svc in backend frontend; do \
	  pidfile="$(RUN_DIR)/$$svc.pid"; \
	  if [ -f "$$pidfile" ]; then kill_tree "$$(cat "$$pidfile")"; rm -f "$$pidfile"; fi; \
	done; \
	free_port $(FRONTEND_PORT) || true; \
	free_port $(BACKEND_PORT) || true; \
	for entry in "backend:$(BACKEND_PORT)" "frontend:$(FRONTEND_PORT)"; do \
	  svc=$${entry%%:*}; port=$${entry##*:}; \
	  if lsof -ti tcp:$$port >/dev/null 2>&1; then \
	    printf "  %-10s still listening on :%s — left alone, inspect it with:\n" "$$svc" "$$port"; \
	    printf "             lsof -nP -iTCP:%s -sTCP:LISTEN\n" "$$port"; \
	  else \
	    printf "  %-10s stopped\n" "$$svc"; \
	  fi; \
	done

restart:
	@$(MAKE) --no-print-directory stop
	@$(MAKE) --no-print-directory start

# ── status ───────────────────────────────────────────────────────────────────
status:
	@printf "\n  %-10s %-7s %-9s %s\n" SERVICE PORT STATE DETAIL; \
	printf "  %-10s %-7s %-9s %s\n" ---------- ------- --------- ------; \
	for entry in "backend:$(BACKEND_PORT)" "frontend:$(FRONTEND_PORT)"; do \
	  svc=$${entry%%:*}; port=$${entry##*:}; \
	  pids=$$(lsof -ti tcp:$$port 2>/dev/null | tr '\n' ' ' | sed 's/ $$//'); \
	  if [ -n "$$pids" ]; then \
	    detail="pid $$pids"; \
	    if [ "$$svc" = "backend" ]; then \
	      health=$$(curl -s -m 3 "http://localhost:$$port/health" 2>/dev/null || true); \
	      case "$$health" in \
	        *'"status":"ok"'*) detail="$$detail · database connected";; \
	        *degraded*)        detail="$$detail · database unreachable";; \
	        *)                 detail="$$detail · no health response";; \
	      esac; \
	    else \
	      detail="$$detail · http://localhost:$$port"; \
	    fi; \
	    printf "  %-10s %-7s %-9s %s\n" "$$svc" "$$port" "running" "$$detail"; \
	  else \
	    printf "  %-10s %-7s %-9s %s\n" "$$svc" "$$port" "stopped" "-"; \
	  fi; \
	done; \
	printf "\n"

# ── logs ─────────────────────────────────────────────────────────────────────
logs:
	@mkdir -p "$(RUN_DIR)"; touch "$(BACKEND_LOG)" "$(FRONTEND_LOG)"; \
	tail -n 40 -f "$(BACKEND_LOG)" "$(FRONTEND_LOG)"

logs-backend:
	@mkdir -p "$(RUN_DIR)"; touch "$(BACKEND_LOG)"; tail -n 60 -f "$(BACKEND_LOG)"

logs-frontend:
	@mkdir -p "$(RUN_DIR)"; touch "$(FRONTEND_LOG)"; tail -n 60 -f "$(FRONTEND_LOG)"

# ── foreground ───────────────────────────────────────────────────────────────
# Both servers in this terminal with interleaved output; Ctrl-C stops both.
dev:
	@$(KILL_TREE) \
	trap 'kill_tree "$$BPID" 2>/dev/null; kill_tree "$$FPID" 2>/dev/null; exit 0' INT TERM; \
	( cd "$(BACKEND_DIR)" && PORT=$(BACKEND_PORT) exec npm run dev ) & BPID=$$!; \
	( cd "$(FRONTEND_DIR)" && exec npm run dev -- --port $(FRONTEND_PORT) --strictPort ) & FPID=$$!; \
	wait

# ── housekeeping ─────────────────────────────────────────────────────────────
install:
	npm --prefix "$(BACKEND_DIR)" install
	npm --prefix "$(FRONTEND_DIR)" install

test:
	npm --prefix "$(BACKEND_DIR)" test
	npm --prefix "$(FRONTEND_DIR)" test

build:
	npm --prefix "$(FRONTEND_DIR)" run build

clean:
	@rm -rf "$(RUN_DIR)"
	@echo "  removed .dev/"
