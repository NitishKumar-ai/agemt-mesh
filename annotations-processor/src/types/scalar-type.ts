import { AbstractType } from './abstract-type';

export class ScalarType extends AbstractType {
  constructor(javaType: unknown, private protoType: string) {
    super(javaType, null);
  }

  getProtoType(): string {
    return this.protoType;
  }

  getRawJavaType(): string {
    return 'null';
  }

  mapFromProto(field: string, lines: string[]): void {
    lines.push(
      `to.${this.javaMethodName('set', field)}( from.${this.protoMethodName('get', field)}() );`,
    );
  }

  private isNullableType(): boolean {
    const jt = this.getJavaType();
    return (
      jt === 'Boolean' ||
      jt === 'Number' ||
      jt === 'BigInt' ||
      jt === 'String' ||
      jt === 'boolean' ||
      jt === 'number' ||
      jt === 'bigint' ||
      jt === 'string'
    );
  }

  mapToProto(field: string, lines: string[]): void {
    const nullable = this.isNullableType();
    const getter =
      this.getJavaType() === 'boolean' || this.getJavaType() === 'Boolean'
        ? this.javaMethodName('is', field)
        : this.javaMethodName('get', field);

    if (nullable) lines.push(`if (from.${getter}() != null) {`);
    lines.push(`to.${this.protoMethodName('set', field)}( from.${getter}() );`);
    if (nullable) lines.push(`}`);
  }

  getDependencies(deps: Set<string>): void {}

  generateAbstractMethods(specs: Set<string>): void {}
}
