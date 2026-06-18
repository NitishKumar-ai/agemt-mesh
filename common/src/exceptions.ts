/**
 * Core exceptions for AgentMesh workflow engine.
 */

/**
 * Base class for all AgentMesh-related errors.
 */
export class AgentMeshError extends Error {
  constructor(message: string, cause?: unknown) {
    // `cause` is standard on ES2022 Error (ErrorOptions); the inherited `.cause`
    // accessor exposes it, mirroring Java's Throwable.getCause(). No custom
    // getter needed.
    super(message, cause === undefined ? undefined : { cause });
    this.name = this.constructor.name;
    // captureStackTrace is V8-only; typed via @types/node.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Exception thrown when a worker execution should not be retried.
 * Maps to FAILED_WITH_TERMINAL_ERROR status.
 */
export class NonRetryableError extends AgentMeshError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Exception thrown when a workflow or task validation fails.
 */
export class ValidationError extends AgentMeshError {
  constructor(message: string, public readonly errors: string[] = []) {
    super(message);
  }
}

/**
 * Exception thrown when a requested resource is not found.
 */
export class NotFoundException extends AgentMeshError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * Exception thrown when there is a conflict, such as a duplicate resource.
 */
export class ConflictException extends AgentMeshError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
