import 'reflect-metadata';

export const PROTO_FIELD_KEY = Symbol('ProtoField');
export const PROTO_MESSAGE_KEY = Symbol('ProtoMessage');
export const PROTO_ENUM_KEY = Symbol('ProtoEnum');

export interface ProtoFieldOptions {
  id: number;
}

/**
 * ProtoField annotates a field inside a struct with metadata on how to expose it on its
 * corresponding Protocol Buffers struct.
 */
export function ProtoField(options: ProtoFieldOptions): PropertyDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(PROTO_FIELD_KEY, options, target, propertyKey);
  };
}

export interface ProtoMessageOptions {
  /**
   * Sets whether the generated mapping code will contain a helper to translate the POJO for this
   * class into the equivalent ProtoBuf object.
   */
  toProto?: boolean;

  /**
   * Sets whether the generated mapping code will contain a helper to translate the ProtoBuf
   * object for this class into the equivalent POJO.
   */
  fromProto?: boolean;

  /**
   * Sets whether this is a wrapper class that will be used to encapsulate complex nested type
   * interfaces.
   */
  wrapper?: boolean;
}

/**
 * ProtoMessage annotates a given class so it becomes exposed via the GRPC API as a native
 * Protocol Buffers struct.
 */
export function ProtoMessage(options: ProtoMessageOptions = {}): ClassDecorator {
  const defaultOptions: ProtoMessageOptions = {
    toProto: true,
    fromProto: true,
    wrapper: false,
    ...options
  };
  return (target) => {
    Reflect.defineMetadata(PROTO_MESSAGE_KEY, defaultOptions, target);
  };
}

/**
 * ProtoEnum annotates an enum type that will be exposed via the GRPC API as a native Protocol
 * Buffers enum.
 */
export function ProtoEnum(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(PROTO_ENUM_KEY, {}, target);
  };
}
