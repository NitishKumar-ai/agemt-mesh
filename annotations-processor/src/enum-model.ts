import { PROTO_ENUM_KEY } from '@agentmesh/annotations';
import { AbstractMessage, Field } from './abstract-message';
import { MessageType } from './types/message-type';

export enum MapType {
  FROM_PROTO = 'fromProto',
  TO_PROTO = 'toProto',
}

export class EnumModel extends AbstractMessage {
  constructor(cls: Function, parent: MessageType) {
    super(cls, parent);

    let protoIndex = 0;
    const proto = cls.prototype;
    for (const prop of Object.getOwnPropertyNames(proto)) {
      const ann = Reflect.getMetadata(PROTO_ENUM_KEY, proto, prop);
      if (ann !== undefined || prop.startsWith('_')) continue;
      this.fields.push(new EnumField(protoIndex++, prop));
    }
  }

  getProtoClass(): string {
    return 'enum';
  }

  private javaMap(mt: MapType, fromType: string, toType: string): [string, string[]] {
    const lines: string[] = [];
    lines.push(`${mt}(from: ${fromType}): ${toType} {`);
    lines.push(`let to: ${toType};`);
    lines.push(`switch (from) {`);
    for (const field of this.fields) {
      const fromName = mt === MapType.TO_PROTO ? field.getName() : field.getProtoName();
      const toName = mt === MapType.TO_PROTO ? field.getProtoName() : field.getName();
      lines.push(`case ${fromName}: to = ${toName}; break;`);
    }
    lines.push(`default: throw new Error("Unexpected enum constant: " + from);`);
    lines.push(`}`);
    lines.push(`return to;`);
    lines.push(`}`);
    return [mt, lines];
  }

  protected javaMapFromProto(lines: string[]): void {
    const [_, methodLines] = this.javaMap(
      MapType.FROM_PROTO,
      this.type.getProtoType(),
      this.clazz.name,
    );
    lines.push(...methodLines);
  }

  protected javaMapToProto(lines: string[]): void {
    const [_, methodLines] = this.javaMap(
      MapType.TO_PROTO,
      this.clazz.name,
      this.type.getProtoType(),
    );
    lines.push(...methodLines);
  }
}

export class EnumField extends Field {
  constructor(index: number, fieldName: string) {
    super(index, fieldName);
  }

  getProtoTypeDeclaration(): string {
    return `${this.getProtoName()} = ${this.getProtoIndex()}`;
  }
}
