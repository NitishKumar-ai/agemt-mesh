import 'reflect-metadata';

export const PROTO_FIELD_KEY = Symbol('ProtoField');
export const PROTO_MESSAGE_KEY = Symbol('ProtoMessage');
export const PROTO_ENUM_KEY = Symbol('ProtoEnum');

export interface ProtoFieldOptions {
  id: number;

  /**
   * Explicit TypeScript type name for this field (e.g. 'string', 'number', 'bigint').
   * Used as a fallback when emitDecoratorMetadata is not available, such as when
   * the code is transpiled by esbuild/tsx which uses TC39 decorators instead of
   * TypeScript experimental decorators.
   */
  type?: string;
}

/**
 * Class-level field registry. Maps each decorated class constructor to a map of
 * field names and their ProtoFieldOptions. Populated by the TC39 decorator path
 * when Reflect.defineMetadata on the prototype is not available.
 */
export const FIELD_REGISTRY = new Map<Function, Map<string, ProtoFieldOptions>>();

/**
 * Accumulator for TC39 field decorator registrations. TC39 decorators process
 * field decorators before the class decorator, so field registrations are
 * accumulated here and flushed to FIELD_REGISTRY when the class decorator runs.
 */
const pendingFields: Array<{ name: string; options: ProtoFieldOptions }> = [];

/**
 * Detects whether the decorator arguments match the TC39 stage 3 decorator
 * protocol. TC39 field decorators receive (value, context) where context is
 * an object with a 'kind' property.
 */
function isTC39DecoratorContext(arg: unknown): arg is { kind: string; name: string | symbol } {
  return (
    arg !== null &&
    typeof arg === 'object' &&
    'kind' in (arg as Record<string, unknown>)
  );
}

/**
 * ProtoField marks a class property for inclusion in the generated Protocol
 * Buffers schema. Supports both TypeScript experimental decorators and TC39
 * stage 3 decorators (used by esbuild/tsx).
 */
export function ProtoField(options: ProtoFieldOptions): any {
  return (targetOrValue: any, propertyKeyOrContext: any) => {
    if (isTC39DecoratorContext(propertyKeyOrContext)) {
      // TC39 stage 3 decorator protocol: (value, context)
      // Field decorators fire before the class decorator, so we queue them.
      const context = propertyKeyOrContext as { kind: string; name: string | symbol };
      if (context.kind === 'field') {
        pendingFields.push({ name: String(context.name), options });
      }
    } else {
      // TypeScript experimental decorator protocol: (target, propertyKey)
      if (
        targetOrValue !== undefined &&
        targetOrValue !== null &&
        (typeof targetOrValue === 'object' || typeof targetOrValue === 'function')
      ) {
        Reflect.defineMetadata(PROTO_FIELD_KEY, options, targetOrValue, propertyKeyOrContext);
      }
    }
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
 * Protocol Buffers struct. Supports both TypeScript experimental decorators and TC39
 * stage 3 decorators (used by esbuild/tsx).
 *
 * Under TC39, this class decorator fires after all field decorators. It flushes
 * any pending field registrations from ProtoField into FIELD_REGISTRY, keyed by
 * the class constructor.
 */
export function ProtoMessage(options: ProtoMessageOptions = {}): any {
  const defaultOptions: ProtoMessageOptions = {
    toProto: true,
    fromProto: true,
    wrapper: false,
    ...options,
  };

  return (targetOrValue: any, contextOrUndefined?: any) => {
    // Under both protocols, the first argument is the class constructor.
    // TC39: (cls, context)  |  Experimental: (cls)
    const target: Function = targetOrValue;

    Reflect.defineMetadata(PROTO_MESSAGE_KEY, defaultOptions, target);

    // Flush any pending TC39 field registrations into the class-level registry.
    // TC39 processes field decorators before the class decorator, so all fields
    // for this class are already in pendingFields at this point.
    if (pendingFields.length > 0) {
      const fieldMap = new Map<string, ProtoFieldOptions>();
      for (const entry of pendingFields) {
        fieldMap.set(entry.name, entry.options);
      }
      FIELD_REGISTRY.set(target, fieldMap);
      pendingFields.length = 0;
    }
  };
}

/**
 * ProtoEnum annotates an enum type that will be exposed via the GRPC API as a native Protocol
 * Buffers enum.
 */
export function ProtoEnum(): any {
  return (target: any) => {
    const cls: Function = target;
    Reflect.defineMetadata(PROTO_ENUM_KEY, {}, cls);
  };
}
