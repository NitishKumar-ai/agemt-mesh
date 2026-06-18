import { AbstractType } from './abstract-type';

export class MessageType extends AbstractType {
  private simpleNames: string[];

  constructor(
    javaType: unknown,
    protoType: string,
    private protoFilePath: string,
  ) {
    super(javaType, null);
    this.simpleNames = protoType.split('.');
  }

  getSimpleNames(): string[] {
    return this.simpleNames;
  }

  addNested(name: string): string {
    this.simpleNames.push(name);
    return this.simpleNames.slice(1).join('.');
  }

  getProtoType(): string {
    return this.simpleNames.slice(1).join('.');
  }

  getProtoFilePath(): string {
    return this.protoFilePath;
  }

  getRawJavaType(): string {
    return this.simpleNames[this.simpleNames.length - 1] || '';
  }

  mapToProto(field: string, lines: string[]): void {
    const getter = this.javaMethodName('get', field);
    lines.push(`if (from.${getter}() != null) {`);
    lines.push(`to.${this.protoMethodName('set', field)}( toProto( from.${getter}() ) );`);
    lines.push(`}`);
  }

  private isEnum(): boolean {
    const clazz = this.getJavaType();
    return typeof clazz === 'function' && clazz.name.endsWith('Enum');
  }

  mapFromProto(field: string, lines: string[]): void {
    if (!this.isEnum()) {
      lines.push(`if (from.${this.protoMethodName('has', field)}()) {`);
    }
    lines.push(
      `to.${this.javaMethodName('set', field)}( fromProto( from.${this.protoMethodName('get', field)}() ) );`,
    );
    if (!this.isEnum()) lines.push(`}`);
  }

  getDependencies(deps: Set<string>): void {
    deps.add(this.protoFilePath);
  }

  generateAbstractMethods(specs: Set<string>): void {}
}
