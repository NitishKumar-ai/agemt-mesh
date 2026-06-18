import { AbstractMessage } from './abstract-message';
import { Message } from './message';
import { TypeMapper } from './types/type-mapper';

export class ProtoFile {
  static PROTO_SUFFIX = 'Pb';

  private baseClass: string;
  private message: AbstractMessage;
  private filePath: string;

  constructor(
    cls: Function,
    private protoPackageName: string,
    private javaPackageName: string,
    private goPackageName: string,
  ) {
    const simpleName = cls.name;
    this.filePath = `model/${simpleName.toLowerCase()}.proto`;
    this.baseClass = `${this.javaPackageName}.${simpleName}${ProtoFile.PROTO_SUFFIX}`;
    this.message = new Message(cls, TypeMapper.INSTANCE.baseClass(this.baseClass, this.filePath));
  }

  getJavaClassName(): string {
    const parts = this.baseClass.split('.');
    return parts[parts.length - 1] || this.baseClass;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getProtoPackageName(): string {
    return this.protoPackageName;
  }

  getJavaPackageName(): string {
    return this.javaPackageName;
  }

  getGoPackageName(): string {
    return this.goPackageName;
  }

  getMessage(): AbstractMessage {
    return this.message;
  }

  getIncludes(): Set<string> {
    const includes = new Set<string>();
    this.message.findDependencies(includes);
    includes.delete(this.getFilePath());
    return includes;
  }
}
