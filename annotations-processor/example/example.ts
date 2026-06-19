import { ProtoMessage, ProtoField } from '@agentmesh/annotations';

@ProtoMessage()
export class Example {
  @ProtoField({ id: 1, type: 'string' })
  name!: string;

  @ProtoField({ id: 2, type: 'bigint' })
  count!: bigint;
}
