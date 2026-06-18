import { MessageType } from './types/message-type';
import { TypeMapper } from './types/type-mapper';

export interface FieldTemplate {
  protoTypeDeclaration: string;
}

export interface MessageTemplate {
  protoClass: string;
  name: string;
  fields: FieldTemplate[];
  nested: MessageTemplate[];
}

export abstract class AbstractMessage {
  protected clazz: Function;
  protected type: MessageType;
  protected fields: Field[] = [];
  protected nested: AbstractMessage[] = [];

  constructor(cls: Function, parentType: MessageType) {
    this.clazz = cls;
    this.type = TypeMapper.INSTANCE.declare(cls, parentType);
  }

  addNested(msg: AbstractMessage): void {
    this.nested.push(msg);
  }

  abstract getProtoClass(): string;
  protected abstract javaMapToProto(lines: string[]): void;
  protected abstract javaMapFromProto(lines: string[]): void;

  generateJavaMapper(lines: string[]): void {
    this.javaMapToProto(lines);
    this.javaMapFromProto(lines);
    for (const nested of this.nested) {
      nested.generateJavaMapper(lines);
    }
  }

  generateAbstractMethods(specs: Set<string>): void {
    for (const field of this.fields) {
      field.generateAbstractMethods(specs);
    }
    for (const nested of this.nested) {
      nested.generateAbstractMethods(specs);
    }
  }

  findDependencies(dependencies: Set<string>): void {
    for (const field of this.fields) {
      field.getDependencies(dependencies);
    }
    for (const nested of this.nested) {
      nested.findDependencies(dependencies);
    }
  }

  getNested(): AbstractMessage[] {
    return this.nested;
  }

  getFields(): Field[] {
    return this.fields;
  }

  getName(): string {
    return this.clazz.name;
  }

  getClazz(): Function {
    return this.clazz;
  }

  toTemplate(): MessageTemplate {
    return {
      protoClass: this.getProtoClass(),
      name: this.getName(),
      fields: this.fields.map((f) => f.toTemplate()),
      nested: this.nested.map((n) => n.toTemplate()),
    };
  }
}

export abstract class Field {
  constructor(
    protected protoIndex: number,
    protected fieldName: string,
  ) {}

  abstract getProtoTypeDeclaration(): string;

  getProtoIndex(): number {
    return this.protoIndex;
  }

  getName(): string {
    return this.fieldName;
  }

  getProtoName(): string {
    return this.fieldName.toUpperCase();
  }

  getDependencies(deps: Set<string>): void {}

  generateAbstractMethods(specs: Set<string>): void {}

  toTemplate(): FieldTemplate {
    return {
      protoTypeDeclaration: this.getProtoTypeDeclaration(),
    };
  }
}
