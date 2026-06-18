import { ProtoMessage, ProtoField } from '@conductor/annotations';

@ProtoMessage()
export class Example {
  @ProtoField({ id: 1 })
  name!: string;

  @ProtoField({ id: 2 })
  count!: bigint;
}
