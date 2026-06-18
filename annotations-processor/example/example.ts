import { ProtoMessage, ProtoField } from '@agentmesh/annotations';

@ProtoMessage()
export class Example {
  @ProtoField({ id: 1 })
  name!: string;

  @ProtoField({ id: 2 })
  count!: bigint;
}
