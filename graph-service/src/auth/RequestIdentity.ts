export interface RequestPrincipal {
  id?: unknown;
  user_id?: unknown;
  userId?: unknown;
  sub?: unknown;
  tenant_id?: unknown;
  tenantId?: unknown;
  org_id?: unknown;
  orgId?: unknown;
}

export interface RequestWithPrincipal {
  user?: RequestPrincipal;
}

/**
 * Resolve identity only from a principal populated by upstream authentication.
 * Caller-controlled query parameters and headers must never be passed here.
 */
export function resolveRequestUserId(
  request: RequestWithPrincipal | undefined,
): string | undefined {
  const principal = request?.user;
  if (!principal) return undefined;

  for (const value of [principal.id, principal.user_id, principal.userId, principal.sub]) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Resolve tenant identity only from a principal populated by upstream authentication.
 * Caller-controlled query parameters, body fields, and headers must never be trusted
 * for tenant scoping.
 */
export function resolveRequestTenantId(
  request: RequestWithPrincipal | undefined,
): string | undefined {
  const principal = request?.user;
  if (!principal) return undefined;

  for (const value of [
    principal.tenant_id,
    principal.tenantId,
    principal.org_id,
    principal.orgId,
  ]) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}
