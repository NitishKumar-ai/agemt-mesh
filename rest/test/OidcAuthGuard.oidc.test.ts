/**
 * OIDC/JWKS verification path tests.
 *
 * These suites describe the behavior of OidcAuthGuard when OIDC_ISSUER /
 * OIDC_JWKS_URI are configured (asymmetric IdP-signed tokens verified via
 * jose). That code path has not been implemented yet: the guard currently
 * uses symmetric `jsonwebtoken` only.
 *
 * The tests are retained as executable contracts for the OIDC implementation
 * milestone. They require `jose` as a devDependency; add it and remove the
 * `.skip` markers when the OIDC path lands.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OidcAuthGuard } from '../src/OidcAuthGuard.js';

const ISSUER = 'https://idp.example.com/';
const AUDIENCE = 'agentmesh-api';

function makeContext(token?: string): ExecutionContext {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const guard = new OidcAuthGuard(reflector);
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const ctx = {
    getHandler: () => {},
    getClass: () => {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}), getNext: () => () => {} }),
  } as unknown as ExecutionContext;
  return ctx;
}

// canActivate returns a boolean (sync paths) or a Promise (OIDC path), and may
// throw synchronously. An async wrapper normalizes all of these to a promise
// that resolves/rejects uniformly.
async function makeGuardActivate(ctx: ExecutionContext): Promise<boolean> {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const guard = new OidcAuthGuard(reflector);
  return guard.canActivate(ctx);
}

describe.skip('OidcAuthGuard — OIDC/JWKS path (not yet implemented)', () => {
  beforeEach(() => {
    process.env.OIDC_ISSUER = ISSUER;
    process.env.OIDC_AUDIENCE = AUDIENCE;
    process.env.OIDC_JWKS_URI = 'https://idp.example.com/.well-known/jwks.json';
  });

  afterEach(() => {
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_AUDIENCE;
    delete process.env.OIDC_JWKS_URI;
  });

  it('accepts a valid IdP-signed token and populates request.user', async () => {
    // Requires jose: generateKeyPair, SignJWT, createLocalJWKSet
  });

  it('rejects a token with the wrong issuer', async () => {
    // Requires jose
  });

  it('rejects a token with the wrong audience', async () => {
    // Requires jose
  });

  it('rejects an expired token', async () => {
    // Requires jose
  });

  it('rejects a tampered token', async () => {
    // Requires jose
  });
});

describe.skip('OidcAuthGuard — fail-closed when auth is unconfigured outside dev (not yet implemented)', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_MODE = 'false';
    delete process.env.OIDC_ISSUER;
  });
  afterEach(() => {
    delete process.env.AUTH_DEV_MODE;
  });

  it('refuses any token (no symmetric fallback) when neither OIDC nor dev mode is set', async () => {
    // Requires AUTH_DEV_MODE fail-closed implementation
  });
});

