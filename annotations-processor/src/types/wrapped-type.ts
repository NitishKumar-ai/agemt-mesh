import { AbstractType } from './abstract-type';
import { MessageType } from './message-type';
import { GenericType } from './generic-type';
import { TypeMapper } from './type-mapper';

export class WrappedType extends AbstractType {
  constructor(
    private realType: AbstractType,
    private wrappedType: MessageType,
  ) {
    super(realType.getJavaType(), wrappedType.getJavaProtoType());
  }

  static wrap(realType: GenericType): WrappedType {
    const valueType = realType.getValueType().getJavaType();
    if (typeof valueType !== 'function' && typeof valueType !== 'string') {
      throw new Error(`cannot wrap primitive type: ${valueType}`);
    }

    const className =
      (typeof valueType === 'function' ? valueType.name : valueType) +
      realType.getWrapperSuffix();
    const wrappedType = TypeMapper.INSTANCE.getByClassName(className);
    if (!wrappedType) throw new Error(`missing wrapper class: ${className}`);
    return new WrappedType(realType, wrappedType);
  }

  getProtoType(): string {
    return this.wrappedType.getProtoType();
  }

  getRawJavaType(): string {
    return this.realType.getRawJavaType();
  }

  mapToProto(field: string, lines: string[]): void {
    this.wrappedType.mapToProto(field, lines);
  }

  mapFromProto(field: string, lines: string[]): void {
    this.wrappedType.mapFromProto(field, lines);
  }

  getDependencies(deps: Set<string>): void {
    this.realType.getDependencies(deps);
    this.wrappedType.getDependencies(deps);
  }

  generateAbstractMethods(specs: Set<string>): void {
    specs.add(
      `abstract fromProto(in: ${this.wrappedType.getJavaProtoType()}): ${this.realType.getJavaType()};`,
    );
    specs.add(
      `abstract toProto(in: ${this.realType.getJavaType()}): ${this.wrappedType.getJavaProtoType()};`,
    );
  }
}
