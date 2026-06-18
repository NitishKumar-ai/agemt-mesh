# Azure Blob External Storage Module 

This module use azure blob to store and retrieve workflows/tasks input/output payload that
went over the thresholds defined in properties named `agentmesh.[workflow|task].[input|output].payload.threshold.kb`.

**Warning** Azure Java SDK use libs already present inside `agentmesh` like `jackson` and `netty`.
You may encounter deprecated issues, or conflicts and need to adapt the code if the module is not maintained along with `agentmesh`.
It has only been tested with **v12.2.0**.

## Configuration

### Usage

Documentation [External Payload Storage]([https://agentmesh.github.io/agentmesh/externalpayloadstorage/#azure-blob-storage](https://docs.agentmesh-oss.org/documentation/advanced/externalpayloadstorage.html))

See [https://docs.agentmesh-oss.org/documentation/advanced/externalpayloadstorage.html]() for more details
### Example

```properties
agentmesh.additional.modules=com.agentmesh.agentmesh.azureblob.AzureBlobModule
es.set.netty.runtime.available.processors=false

workflow.external.payload.storage=AZURE_BLOB
workflow.external.payload.storage.azure_blob.connection_string=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;EndpointSuffix=localhost
workflow.external.payload.storage.azure_blob.signedurlexpirationseconds=360
```

## Testing

You can use [Azurite](https://github.com/Azure/Azurite) to simulate an Azure Storage.

### Troubleshoots

* When using **es5 persistance** you will receive an `java.lang.IllegalStateException` because the Netty lib will call `setAvailableProcessors` two times. To resolve this issue you need to set the following system property

```
es.set.netty.runtime.available.processors=false
```

If you want to change the default HTTP client of azure sdk, you can use `okhttp` instead of `netty`.
For that you need to add the following [dependency](https://github.com/Azure/azure-sdk-for-java/tree/master/sdk/storage/azure-storage-blob#default-http-client).

```
com.azure:azure-core-http-okhttp:${compatible version}
```
