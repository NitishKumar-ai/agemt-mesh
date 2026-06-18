# Docker

## AgentMesh UI

This Dockerfile create the agentmesh:ui image

## Building the image

Run the following commands from the project root.

`docker build -f docker/ui/Dockerfile -t agentmesh:ui .`

## Running the agentmesh server

- With localhost agentmesh server: `docker run -p 5000:5000 -d -t agentmesh:ui`
- With external agentmesh server: `docker run -p 5000:5000 -d -t -e "WF_SERVER=http://agentmesh-server:8080" agentmesh:ui`
