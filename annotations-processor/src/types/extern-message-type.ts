import { MessageType } from './message-type';

export class ExternMessageType extends MessageType {
  constructor(
    javaType: unknown,
    protoType: string,
    private externProtoType: string,
    protoFilePath: string,
  ) {
    super(javaType, protoType, protoFilePath);
  }

  getProtoType(): string {
    return this.externProtoType;
  }

  generateAbstractMethods(specs: Set<string>): void {
    specs.add(`abstract fromProto(in: ${this.getJavaProtoType()}): ${this.getJavaType()};`);
    specs.add(`abstract toProto(in: ${this.getJavaType()}): ${this.getJavaProtoType()};`);
  }
}
