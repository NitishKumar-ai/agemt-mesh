import { describe, expect, it, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { OidcAuthGuard } from '../src/OidcAuthGuard.js';

describe('OidcAuthGuard', () => {
  let guard: OidcAuthGuard;
  let reflector: Reflector;

  const secret = 'super-secret-key-change-me';

  beforeEach(() => {
    reflector = {
      getAllAndOverride: (key: string, targets: any[]) => false,
    } as unknown as Reflector;
    guard = new OidcAuthGuard(reflector);
    delete process.env.JWT_SECRET;
  });

  const createMockContext = (authHeader?: string, path?: string, isPublic = false): ExecutionContext => {
    const reflectorMock = {
      getAllAndOverride: (key: string, targets: any[]) => isPublic,
    } as unknown as Reflector;
    guard = new OidcAuthGuard(reflectorMock);

    const req: any = {
      headers: authHeader ? { authorization: authHeader } : {},
      url: path || '/api/workflows',
    };

    return {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => () => {},
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access to public endpoints (reflector metadata isPublic = true)', () => {
    const context = createMockContext(undefined, '/api/workflows', true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws UnauthorizedException if authorization header is missing', () => {
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Missing authorization header');
  });

  it('throws UnauthorizedException if authorization header is not Bearer type', () => {
    const context = createMockContext('Basic abcde');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid authorization header format');
  });

  it('throws UnauthorizedException if bearer token format is incorrect', () => {
    const context = createMockContext('Bearer');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Invalid authorization header format');
  });

  it('successfully verifies a valid token and populates request.user', () => {
    const payload = { id: 'usr_123', user_id: 'john', sub: 'subject' };
    const token = jwt.sign(payload, secret);
    const context = createMockContext(`Bearer ${token}`);

    const result = guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(payload.id);
    expect(req.user.user_id).toBe(payload.user_id);
    expect(req.user.sub).toBe(payload.sub);
  });

  it('verifies token against process.env.JWT_SECRET if set', () => {
    const customSecret = 'my-custom-jwt-secret';
    process.env.JWT_SECRET = customSecret;

    const payload = { id: 'usr_456' };
    const token = jwt.sign(payload, customSecret);
    const context = createMockContext(`Bearer ${token}`);

    const result = guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest();
    expect(req.user.id).toBe(payload.id);
  });

  it('throws UnauthorizedException for an expired token', () => {
    const payload = { id: 'usr_123' };
    // Signed with exp in the past
    const token = jwt.sign(payload, secret, { expiresIn: '-10s' });
    const context = createMockContext(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('jwt expired');
  });

  it('throws UnauthorizedException for an invalid signature token', () => {
    const payload = { id: 'usr_123' };
    const token = jwt.sign(payload, 'different-secret');
    const context = createMockContext(`Bearer ${token}`);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('invalid signature');
  });
});
