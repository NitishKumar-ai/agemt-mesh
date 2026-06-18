---
description: "Building from Source — build and run the AgentMesh server and UI locally from source for development and testing."
---
# Building from source

Build and run AgentMesh server and UI locally from source. The default configuration uses in-memory persistence with no indexing — all data is lost when the server stops. This setup is for development and testing only.

For persistent backends, use [Docker Compose](deploy.md) or configure a database backend.


## Prerequisites

- Java (JDK) 21+
- (Optional) [Docker](https://www.docker.com/get-started/) for running tests


## Building and running the server

1. Clone the repository:

    ```shell
    git clone https://github.com/agentmesh-oss/agentmesh.git
    cd agentmesh
    ```

2. Run with Gradle:

    ```shell
    cd server
    ../gradlew bootRun
    ```

    To use a custom configuration file:

    ```shell
    CONFIG_PROP=config.properties ../gradlew bootRun
    ```

3. The server is now running:

    | URL | Description |
    |:----|:---|
    | `http://localhost:8080` | AgentMesh UI |
    | `http://localhost:8080/swagger-ui/index.html` | REST API docs |
    | `http://localhost:8080/api/` | API base URL |


## Running from a pre-compiled JAR

As an alternative to building from source, download and run the pre-compiled JAR:

```shell
export AGENTMESH_VER=3.21.10
export REPO_URL=https://repo1.maven.org/maven2/org/agentmeshoss/agentmesh-server
curl $REPO_URL/$AGENTMESH_VER/agentmesh-core-$AGENTMESH_VER-boot.jar \
  --output agentmesh-core-$AGENTMESH_VER-boot.jar
java -jar agentmesh-core-$AGENTMESH_VER-boot.jar
```


## Running the UI from source

### Prerequisites

- A running AgentMesh server on port 8080
- [Node.js](https://nodejs.org) v18+
- [Yarn](https://classic.yarnpkg.com/en/docs/install)

### Steps

```shell
cd ui
yarn install
yarn run start
```

The UI is accessible at [http://localhost:5000](http://localhost:5000).

To build compiled assets for production hosting:

```shell
yarn build
```
