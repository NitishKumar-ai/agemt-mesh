import { GenericType } from './generic-type';
import { AbstractType } from './abstract-type';
import { ScalarType } from './scalar-type';

export class MapType extends GenericType {
  private keyType: AbstractType | null = null;
  private valueType: AbstractType | null = null;

  constructor(type: unknown) {
    super(type);
  }

  getWrapperSuffix(): string {
    return 'Map';
  }

  getValueType(): AbstractType {
    if (this.valueType === null) {
      this.valueType = this.resolveGenericParam(1);
    }
    return this.valueType;
  }

  getKeyType(): AbstractType {
    if (this.keyType === null) {
      this.keyType = this.resolveGenericParam(0);
    }
    return this.keyType;
  }

  mapToProto(field: string, lines: string[]): void {
    const valueType = this.getValueType();
    if (valueType instanceof ScalarType) {
      lines.push(
        `to.${this.protoMethodName('putAll', field)}( from.${this.javaMethodName('get', field)}() );`,
      );
    } else {
      lines.push(
        `for (const [key, val] of Object.entries(from.${this.javaMethodName('get', field)}())) {`,
      );
      lines.push(`to.${this.protoMethodName('put', field)}( key, toProto(val) );`);
      lines.push(`}`);
    }
  }

  mapFromProto(field: string, lines: string[]): void {
    const valueType = this.getValueType();
    if (valueType instanceof ScalarType) {
      lines.push(
        `to.${this.javaMethodName('set', field)}( from.${this.protoMethodName('get', field)}Map() );`,
      );
    } else {
      const mapName = `${field}Map`;
      lines.push(`const ${mapName} = new Map();`);
      lines.push(
        `for (const [key, val] of from.${this.protoMethodName('get', field)}Map().entries()) {`,
      );
      lines.push(`${mapName}.set(key, this.fromProto(val));`);
      lines.push(`}`);
      lines.push(`to.${this.javaMethodName('set', field)}(${mapName});`);
    }
  }

  resolveJavaProtoType(): string {
    return `Map<${this.getKeyType().getJavaProtoType()}, ${this.getValueType().getJavaProtoType()}>`;
  }

  getProtoType(): string {
    const keyType = this.getKeyType();
    const valueType = this.getValueType();
    if (!(keyType instanceof ScalarType)) {
      throw new Error(`cannot map non-scalar map key: ${this.getJavaType()}`);
    }
    return `map<${keyType.getProtoType()}, ${valueType.getProtoType()}>`;
  }
}
