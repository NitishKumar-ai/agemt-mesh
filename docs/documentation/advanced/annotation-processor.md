---
description: "Annotation Processor — use code generation during AgentMesh builds with annotation-based processing for protobuf and more."
---
# Annotation Processor

This module is strictly for code generation tasks during builds based on annotations.
Currently supports `protogen`

### Usage

This is an actual example of this module which is implemented in common/build.gradle

```groovy
task protogen(dependsOn: jar, type: JavaExec) {
    classpath configurations.annotationsProcessorCodegen
    main = 'com.agentmesh.agentmesh.annotationsprocessor.protogen.ProtoGenTask'
    args(
            "agentmesh.proto",
            "com.agentmesh.agentmesh.proto",
            "github.com/agentmesh/agentmesh/client/gogrpc/agentmesh/model",
            "${rootDir}/grpc/src/main/proto",
            "${rootDir}/grpc/src/main/java/com/agentmesh/agentmesh/grpc",
            "com.agentmesh.agentmesh.grpc",
            jar.archivePath,
            "com.agentmesh.agentmesh.common",
    )
}
```

