import { AbstractType } from './abstract-type';
import { ScalarType } from './scalar-type';
import { MessageType } from './message-type';
import { ExternMessageType } from './extern-message-type';
import { ListType } from './list-type';
import { MapType } from './map-type';

export const PROTO_LIST_TYPES = new Map<string, string>([
  ['Array', 'Array'],
  ['Set', 'Set'],
]);

export class TypeMapper {
  static INSTANCE = new TypeMapper();

  private types = new Map<unknown, AbstractType>();

  addScalarType(t: unknown, protoType: string): void {
    this.types.set(t, new ScalarType(t, protoType));
  }

  addMessageType(t: unknown, message: MessageType): void {
    this.types.set(t, message);
  }

  constructor() {
    this.addScalarType('number', 'int32');
    this.addScalarType('Number', 'int32');
    this.addScalarType('bigint', 'int64');
    this.addScalarType('BigInt', 'int64');
    this.addScalarType('string', 'string');
    this.addScalarType('String', 'string');
    this.addScalarType('boolean', 'bool');
    this.addScalarType('Boolean', 'bool');

    this.addMessageType(
      'object',
      new ExternMessageType(
        'object',
        'google.protobuf.Value',
        'google.protobuf.Value',
        'google/protobuf/struct.proto',
      ),
    );

    this.addMessageType(
      'any',
      new ExternMessageType(
        'any',
        'google.protobuf.Any',
        'google.protobuf.Any',
        'google/protobuf/any.proto',
      ),
    );
  }

  get(t: unknown): AbstractType {
    if (!this.types.has(t)) {
      if (typeof t === 'string') {
        if (PROTO_LIST_TYPES.has(t)) {
          this.types.set(t, new ListType(t));
        } else if (t.startsWith('Map<')) {
          this.types.set(t, new MapType(t));
        }
      }
    }
    const found = this.types.get(t);
    if (!found) {
      throw new Error(`Cannot map type: ${t}`);
    }
    return found;
  }

  getByClassName(className: string): MessageType | null {
    for (const t of this.types.values()) {
      if (t instanceof MessageType && !(t instanceof ExternMessageType)) {
        const names = t.getSimpleNames();
        if (names.length > 0 && names[names.length - 1] === className) return t;
      }
    }
    return null;
  }

  declare(cls: Function, parent: MessageType): MessageType {
    const simpleName = cls.name;
    const nestedName = parent.addNested(simpleName);
    const t = new MessageType(cls, nestedName, parent.getProtoFilePath());
    if (this.types.has(cls)) {
      throw new Error(`duplicate type declaration: ${cls.name}`);
    }
    this.types.set(cls, t);
    return t;
  }

  baseClass(className: string, protoFilePath: string): MessageType {
    return new MessageType(Object, className, protoFilePath);
  }
}
