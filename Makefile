.PHONY: demo

demo:
	@echo "Checking infrastructure..."
	@docker info > /dev/null 2>&1 || (echo "Docker is not running." && exit 1)
	@echo "Running multi-agent demo..."
	@python demo.py

# ── Conductor ─────────────────────────────────────────────────────────────────

conductor-up:
	@echo "Starting Conductor + Postgres..."
	docker compose -f conductor/docker-compose.yml up -d
	@echo "Conductor UI → http://localhost:5001"
	@echo "Conductor API → http://localhost:8080/api"

conductor-down:
	docker compose -f conductor/docker-compose.yml down

conductor-logs:
	docker compose -f conductor/docker-compose.yml logs -f conductor-server

conductor-workers:
	@echo "Starting Agent Mesh Conductor workers..."
	CONDUCTOR_ENABLED=1 python3 -m conductor.workers

conductor-status:
	@curl -s http://localhost:8080/health | python3 -m json.tool 2>/dev/null || echo "Conductor not running"

conductor-clean:
	docker compose -f conductor/docker-compose.yml down -v
