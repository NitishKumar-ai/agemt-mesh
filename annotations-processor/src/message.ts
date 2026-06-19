import { AbstractMessage, Field } from './abstract-message.js';
import { AbstractType } from './types/abstract-type.js';
import { MessageType } from './types/message-type.js';
import { TypeMapper } from './types/type-mapper.js';
import {
  PROTO_FIELD_KEY,
  PROTO_MESSAGE_KEY,
  FIELD_REGISTRY,
  type ProtoFieldOptions,
} from '@agentmesh/annotations';

/**
 * Message represents a class annotated with @ProtoMessage, extracting its
 * @ProtoField-decorated properties to build the Protocol Buffers schema.
 *
 * Field metadata is resolved through two paths:
 *   1. Reflect.defineMetadata (TypeScript experimental decorators with emitDecoratorMetadata)
 *   2. FIELD_REGISTRY side-channel (TC39 stage 3 decorators, used by esbuild/tsx)
 *
 * Both paths are checked so the processor works regardless of the transpiler.
 */
export class Message extends AbstractMessage {
  constructor(cls: Function, parent: MessageType) {
    super(cls, parent);

    const proto = cls.prototype;

    // Collect fields from Reflect metadata (experimental decorator path)
    const reflectFields = this.collectReflectFields(cls, proto);

    // Collect fields from FIELD_REGISTRY (TC39 decorator path)
    const registryFields = FIELD_REGISTRY.get(cls);

    // Merge both sources, avoiding duplicates. Registry fields take precedence
    // for options since they carry the explicit 'type' field.
    const mergedFields = new Map<string, ProtoFieldOptions>();

    for (const [name, opts] of reflectFields) {
      mergedFields.set(name, opts);
    }
    if (registryFields) {
      for (const [name, opts] of registryFields) {
        mergedFields.set(name, opts);
      }
    }

    // Build the Field objects in index order for deterministic output
    const sortedEntries = [...mergedFields.entries()].sort(
      (a, b) => a[1].id - b[1].id,
    );
    for (const [propName, opts] of sortedEntries) {
      this.fields.push(new MessageField(opts.id, propName, cls, proto, opts));
    }
  }

  /**
   * Scans the class prototype and constructor for properties that have
   * PROTO_FIELD_KEY metadata defined via Reflect.defineMetadata. This path
   * is taken when the code was compiled with TypeScript's experimentalDecorators.
   */
  private collectReflectFields(
    cls: Function,
    proto: object,
  ): Map<string, ProtoFieldOptions> {
    const result = new Map<string, ProtoFieldOptions>();

    // Attempt to instantiate the class to discover instance property names.
    // Fields with definite assignment (name!: string) only appear on the
    // instance, not the prototype.
    let instanceProps: string[];
    try {
      instanceProps = Object.getOwnPropertyNames(new (cls as new () => any)());
    } catch {
      instanceProps = [];
    }

    // Check metadata keys registered on the prototype
    const allMetadataKeys = Reflect.getMetadataKeys(proto) || [];
    const constructorMetadataKeys = Reflect.getMetadataKeys(cls) || [];

    for (const key of [...allMetadataKeys, ...constructorMetadataKeys]) {
      if (typeof key === 'string' || typeof key === 'symbol') {
        const keyStr = String(key);
        const ann =
          Reflect.getMetadata(PROTO_FIELD_KEY, proto, keyStr) ||
          Reflect.getMetadata(PROTO_FIELD_KEY, cls, keyStr);
        if (ann && typeof ann === 'object') {
          result.set(keyStr, ann as ProtoFieldOptions);
        }
      }
    }

    // Check instance properties that may not have appeared in metadata keys
    for (const prop of instanceProps) {
      if (result.has(prop)) continue;
      const ann =
        Reflect.getMetadata(PROTO_FIELD_KEY, proto, prop) ||
        Reflect.getMetadata(PROTO_FIELD_KEY, cls, prop);
      if (ann && typeof ann === 'object') {
        result.set(prop, ann as ProtoFieldOptions);
      }
    }

    return result;
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

/**
 * MessageField wraps a single @ProtoField-decorated property. It resolves
 * the proto type through three sources in priority order:
 *   1. design:type Reflect metadata (emitDecoratorMetadata)
 *   2. Explicit 'type' in ProtoFieldOptions (TC39 fallback)
 *   3. Default to 'string'
 */
export class MessageField extends Field {
  private type: AbstractType | null = null;
  private cls: Function;
  private proto: object;
  private fieldOptions: ProtoFieldOptions;

  constructor(
    index: number,
    fieldName: string,
    cls: Function,
    proto: object,
    fieldOptions: ProtoFieldOptions,
  ) {
    super(index, fieldName);
    this.cls = cls;
    this.proto = proto;
    this.fieldOptions = fieldOptions;
  }

  getAbstractType(): AbstractType {
    if (this.type === null) {
      // Priority 1: design:type metadata from emitDecoratorMetadata
      const designType = Reflect.getMetadata('design:type', this.proto, this.getName());
      let typeName: string;

      if (designType) {
        typeName = designType.name;
      } else if (this.fieldOptions.type) {
        // Priority 2: explicit type from ProtoFieldOptions (TC39 path)
        typeName = this.fieldOptions.type;
      } else {
        // Priority 3: default fallback
        typeName = 'string';
      }

      this.type = TypeMapper.INSTANCE.get(typeName);
    }
    return this.type;
  }

  getProtoTypeDeclaration(): string {
    return `${this.getAbstractType().getProtoType()} ${this.toUnderscoreCase(this.getName())} = ${this.getProtoIndex()}`;
  }

  private toUnderscoreCase(input: string): string {
    return input.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }

  getDependencies(deps: Set<string>): void {
    this.getAbstractType().getDependencies(deps);
  }

  generateAbstractMethods(specs: Set<string>): void {
    this.getAbstractType().generateAbstractMethods(specs);
  }
}
