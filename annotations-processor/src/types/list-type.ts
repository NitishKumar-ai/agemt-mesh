import { GenericType } from './generic-type';
import { AbstractType } from './abstract-type';
import { ScalarType } from './scalar-type';

export class ListType extends GenericType {
  private valueType: AbstractType | null = null;

  constructor(type: unknown) {
    super(type);
  }

  getWrapperSuffix(): string {
    return 'List';
  }

  getValueType(): AbstractType {
    if (this.valueType === null) {
      this.valueType = this.resolveGenericParam(0);
    }
    return this.valueType;
  }

  mapToProto(field: string, lines: string[]): void {
    const subtype = this.getValueType();
    if (subtype instanceof ScalarType) {
      lines.push(`to.${this.protoMethodName('addAll', field)}( from.${this.javaMethodName('get', field)}() );`);
    } else {
      const javaType = subtype.getJavaType();
      lines.push(`for (const elem of from.${this.javaMethodName('get', field)}()) {`);
      lines.push(`to.${this.protoMethodName('add', field)}( toProto(elem) );`);
      lines.push(`}`);
    }
  }

  mapFromProto(field: string, lines: string[]): void {
    const subtype = this.getValueType();

    if (subtype instanceof ScalarType) {
      lines.push(
        `to.${this.javaMethodName('set', field)}( from.${this.protoMethodName('get', field)}List() );`,
      );
    } else {
      lines.push(
        `to.${this.javaMethodName('set', field)}( from.${this.protoMethodName('get', field)}List().map(e => this.fromProto(e)) );`,
      );
    }
  }

  resolveJavaProtoType(): string {
    return `Array<${this.getValueType().getJavaProtoType()}>`;
  }

  getProtoType(): string {
    return `repeated ${this.getValueType().getProtoType()}`;
  }
}
