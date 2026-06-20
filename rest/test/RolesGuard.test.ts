import { describe, expect, it } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from '../src/RolesGuard.js';

function makeContext(roles: string[] | undefined, requiredRoles: string[] | undefined): {
  guard: RolesGuard;
  context: ExecutionContext;
} {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return requiredRoles;
      return undefined;
    },
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const req: any = { user: roles !== undefined ? { roles } : undefined };
  const context = {
    getHandler: () => {},
    getClass: () => {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => () => {},
    }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const { guard, context } = makeContext([], undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when required roles are an empty array', () => {
    const { guard, context } = makeContext([], []);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the principal has the required role', () => {
    const { guard, context } = makeContext(['admin'], ['admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the principal has one of several required roles', () => {
    const { guard, context } = makeContext(['viewer'], ['admin', 'viewer']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the principal lacks the required role', () => {
    const { guard, context } = makeContext(['viewer'], ['admin']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Requires one of role(s): admin');
  });

  it('denies access when request.user has no roles array', () => {
    const { guard, context } = makeContext(undefined, ['admin']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies access when request.user is not set', () => {
    const reflector = {
      getAllAndOverride: () => ['admin'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const req: any = {};
    const context = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => () => {},
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
