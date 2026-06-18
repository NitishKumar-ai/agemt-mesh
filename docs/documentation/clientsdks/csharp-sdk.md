---
description: "Build AgentMesh workers in C#/.NET with dependency injection, workflow management, and task polling."
---

# C# SDK

!!! info "Source"
    GitHub: [agentmesh-oss/csharp-sdk](https://github.com/agentmesh-oss/csharp-sdk) | Report issues and contribute on GitHub.

## ⭐ AgentMesh OSS
Show support for the AgentMesh OSS.  Please help spread the awareness by starring AgentMesh repo.

[![GitHub stars](https://img.shields.io/github/stars/agentmesh-oss/agentmesh.svg?style=social&label=Star&maxAge=)](https://GitHub.com/agentmesh-oss/agentmesh/)

   
### Setup AgentMesh C# Package​

```shell
dotnet add package agentmesh-csharp
```

## Configurations

### Authentication Settings (Optional)
Configure the authentication settings if your AgentMesh server requires authentication.
* keyId: Key for authentication.
* keySecret: Secret for the key.

```csharp
authenticationSettings: new OrkesAuthenticationSettings(
    KeyId: "key",
    KeySecret: "secret"
)
```

### Access Control Setup
See [Access Control](https://orkes.io/content/docs/getting-started/concepts/access-control) for more details on role-based access control with AgentMesh and generating API keys for your environment.

### Configure API Client
```csharp
using AgentMesh.Api;
using AgentMesh.Client;
using AgentMesh.Client.Authentication;

var configuration = new Configuration() {
    BasePath = basePath,
    AuthenticationSettings = new OrkesAuthenticationSettings("keyId", "keySecret")
};

var workflowClient = configuration.GetClient<WorkflowResourceApi>();

workflowClient.StartWorkflow(
    name: "test-sdk-csharp-workflow",
    body: new Dictionary<string, object>(),
    version: 1
)
```

### Next: [Create and run task workers](https://github.com/agentmesh-sdk/agentmesh-csharp/blob/main/docs/readme/workers.md)


## Examples

Browse all examples on GitHub: [agentmesh-oss/csharp-sdk/csharp-examples](https://github.com/agentmesh-oss/csharp-sdk/tree/main/csharp-examples)

| Example | Type |
|---|---|
| [Examples](https://github.com/agentmesh-oss/csharp-sdk/tree/main/csharp-examples/Examples) | directory |
| [Humantaskexamples](https://github.com/agentmesh-oss/csharp-sdk/blob/main/csharp-examples/HumanTaskExamples.cs) | file |
| [Program](https://github.com/agentmesh-oss/csharp-sdk/blob/main/csharp-examples/Program.cs) | file |
| [Runner](https://github.com/agentmesh-oss/csharp-sdk/blob/main/csharp-examples/Runner.cs) | file |
| [Testworker](https://github.com/agentmesh-oss/csharp-sdk/blob/main/csharp-examples/TestWorker.cs) | file |
| [Utils](https://github.com/agentmesh-oss/csharp-sdk/tree/main/csharp-examples/Utils) | directory |
| [Workflowexamples](https://github.com/agentmesh-oss/csharp-sdk/blob/main/csharp-examples/WorkFlowExamples.cs) | file |
