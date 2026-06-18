# Annotations 
Used for Conductor to convert TypeScript classes to metadata for protobuf generation.

- `protogen` Annotations (TypeScript Decorators)
  - Original Author: Vicent Martí - https://github.com/vmg
  - Original Repo: https://github.com/vmg/protogen

## Usage

These are TypeScript decorators that use `reflect-metadata` to store protobuf mapping information.

```typescript
import { ProtoMessage, ProtoField } from '@conductor/annotations';

@ProtoMessage()
class MyMessage {
    @ProtoField({ id: 1 })
    name: string;
}
```
