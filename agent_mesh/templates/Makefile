.PHONY: demo

demo:
	@echo "Checking infrastructure..."
	@docker info > /dev/null 2>&1 || (echo "Docker is not running." && exit 1)
	@echo "Running multi-agent demo..."
	@python demo.py
