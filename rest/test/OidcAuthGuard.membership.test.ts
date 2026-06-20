import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { OidcAuthGuard } from '../src/OidcAuthGuard.js';
import type { MembershipVerifier } from '../src/RequestPrincipal.js';

const secret = 'super-secret-key-change-me';

function ctx(token: string): { context: ExecutionContext; req: any } {
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const context = {
    getHandler: () => {},
    getClass: () => {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}), getNext: () => () => {} }),
  } as unknown as ExecutionContext;
  return { context, req };
}

function guardWith(verifier: MembershipVerifier): OidcAuthGuard {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  return new OidcAuthGuard(reflector, verifier);
}

describe('OidcAuthGuard — tenant membership enforcement (T2)', () => {
  beforeEach(() => {
    delete process.env.JWT_SECRET;
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('denies a token whose subject is not an active tenant member', async () => {
    const verifier: MembershipVerifier = {
      resolveActiveMember: async () => null,
    };
    const token = jwt.sign({ sub: 'usr_x', tenant_id: 'org_1' }, secret);
    const { context } = ctx(token);
    await expect(Promise.resolve(guardWith(verifier).canActivate(context))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('denies a token with no resolvable tenant claim', async () => {
    const verifier: MembershipVerifier = {
      resolveActiveMember: async () => ({ principalId: 'p1' }),
    };
    const token = jwt.sign({ sub: 'usr_x' }, secret); // no tenant
    const { context } = ctx(token);
    // The guard throws synchronously when tenant_id is absent (before the
    // async membership verifier is reached), so wrap the call to normalize
    // into a rejected promise.
    await expect(
      (async () => guardWith(verifier).canActivate(context))(),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows an active member and uses the durable principal id', async () => {
    const verifier: MembershipVerifier = {
      resolveActiveMember: async (tenantId, subject) => {
        expect(tenantId).toBe('org_1');
        expect(subject).toBe('usr_x');
        return { principalId: 'durable-principal-1' };
      },
    };
    const token = jwt.sign({ sub: 'usr_x', tenant_id: 'org_1', roles: ['admin'] }, secret);
    const { context, req } = ctx(token);
    await expect(Promise.resolve(guardWith(verifier).canActivate(context))).resolves.toBe(true);
    expect(req.user.id).toBe('durable-principal-1');
    expect(req.user.tenant_id).toBe('org_1');
    expect(req.user.roles).toEqual(['admin']);
  });
});
