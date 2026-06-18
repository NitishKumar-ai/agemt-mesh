import { AbstractMessage, Field } from './abstract-message';
import { AbstractType } from './types/abstract-type';
import { MessageType } from './types/message-type';
import { TypeMapper } from './types/type-mapper';
import { PROTO_FIELD_KEY, PROTO_MESSAGE_KEY } from '@agentmesh/annotations';

export class Message extends AbstractMessage {
  constructor(cls: Function, parent: MessageType) {
    super(cls, parent);

    const proto = cls.prototype;
    let instanceProps: string[];
    try {
      instanceProps = Object.getOwnPropertyNames(new (cls as new () => any)());
    } catch {
      instanceProps = [];
    }
    for (const prop of instanceProps) {
      const ann = Reflect.getMetadata(PROTO_FIELD_KEY, proto, prop);
      if (!ann || typeof ann !== 'object') continue;
      const opts = ann as { id: number };
      this.fields.push(new MessageField(opts.id, prop, cls, proto));
    }
  }

  getProtoClass(): string {
    return 'message';
  }

  private getAnnotation(): { toProto?: boolean; fromProto?: boolean; wrapper?: boolean } {
    return Reflect.getMetadata(PROTO_MESSAGE_KEY, this.clazz) || {};
  }

  protected javaMapToProto(lines: string[]): void {
    const ann = this.getAnnotation();
    if (ann.toProto === false || ann.wrapper) return;

    lines.push(`toProto(from: ${this.clazz.name}): ${this.type.getProtoType()} {`);
    lines.push(`const to = new ${this.type.getProtoType()}();`);
    for (const field of this.fields) {
      if (field instanceof MessageField) {
        const fieldType = field.getAbstractType();
        fieldType.mapToProto(field.getName(), lines);
      }
    }
    lines.push(`return to;`);
    lines.push(`}`);
  }

  protected javaMapFromProto(lines: string[]): void {
    const ann = this.getAnnotation();
    if (ann.fromProto === false || ann.wrapper) return;

    lines.push(`fromProto(from: ${this.type.getProtoType()}): ${this.clazz.name} {`);
    lines.push(`const to = new ${this.clazz.name}();`);
    for (const field of this.fields) {
      if (field instanceof MessageField) {
        const fieldType = field.getAbstractType();
        fieldType.mapFromProto(field.getName(), lines);
      }
    }
    lines.push(`return to;`);
    lines.push(`}`);
  }
}

export class MessageField extends Field {
  private type: AbstractType | null = null;
  private cls: Function;
  private proto: object;

  constructor(index: number, fieldName: string, cls: Function, proto: object) {
    super(index, fieldName);
    this.cls = cls;
    this.proto = proto;
  }

  getAbstractType(): AbstractType {
    if (this.type === null) {
      const designType = Reflect.getMetadata('design:type', this.proto, this.getName());
      const typeName = designType?.name || 'string';
      this.type = TypeMapper.INSTANCE.get(typeName);
    }
    return this.type;
  }

  getProtoTypeDeclaration(): string {
    return `${this.getAbstractType().getProtoType()} ${this.toUnderscoreCase(this.getName())} = ${this.getProtoIndex()}`;
  }

  private toUnderscoreCase(input: string): string {
    return input
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  getDependencies(deps: Set<string>): void {
    this.getAbstractType().getDependencies(deps);
  }

  generateAbstractMethods(specs: Set<string>): void {
    this.getAbstractType().generateAbstractMethods(specs);
  }
}
