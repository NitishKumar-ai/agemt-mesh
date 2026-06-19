# Docker

## AgentMesh UI

This Dockerfile builds the AgentMesh Operator Console (React/Vite).

## Building the image

Run the following commands from the project root:

```bash
docker build -f docker/ui/Dockerfile -t agentmesh:ui .
```

## Running the UI

```bash
# With default localhost API server (http://localhost:8080):
docker run -p 5173:5173 agentmesh:ui

# With a remote API server:
docker run -p 5173:5173 -e "VITE_API_URL=http://agentmesh-server:8080" agentmesh:ui
```

The UI will be available at `http://localhost:5173`.
