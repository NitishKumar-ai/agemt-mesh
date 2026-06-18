import { AbstractType } from './abstract-type';
import { TypeMapper } from './type-mapper';
import { WrappedType } from './wrapped-type';

export abstract class GenericType extends AbstractType {
  constructor(type: unknown) {
    super(type, null);
  }

  protected getRawType(): string {
    const jt = this.getJavaType();
    if (typeof jt === 'string') return jt;
    return 'unknown';
  }

  protected resolveGenericParam(_idx: number): AbstractType {
    const jt = this.getJavaType();
    if (typeof jt === 'string') {
      const abstractType = TypeMapper.INSTANCE.get(jt);
      if (abstractType instanceof GenericType) {
        return WrappedType.wrap(abstractType as GenericType);
      }
      return abstractType;
    }
    const abstractType = TypeMapper.INSTANCE.get(jt);
    if (abstractType instanceof GenericType) {
      return WrappedType.wrap(abstractType as GenericType);
    }
    return abstractType;
  }

  abstract getWrapperSuffix(): string;
  abstract getValueType(): AbstractType;

  abstract resolveJavaProtoType(): string;

  getRawJavaType(): string {
    return this.getRawType();
  }

  getDependencies(deps: Set<string>): void {
    this.getValueType().getDependencies(deps);
  }

  generateAbstractMethods(specs: Set<string>): void {
    this.getValueType().generateAbstractMethods(specs);
  }

  getJavaProtoType(): string | null {
    if (this.javaProtoType === null) {
      this.javaProtoType = this.resolveJavaProtoType();
    }
    return this.javaProtoType;
  }
}
