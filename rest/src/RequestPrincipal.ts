/**
 * Canonical request principal (Pass 1 / T2).
 *
 * Verified token claims are normalized into this curated projection before being
 * attached to `request.user`. The raw decoded JWT is deliberately NOT exposed:
 * downstream code reads identity through a small, stable set of fields rather
 * than reaching into arbitrary provider-specific claims.
 *
 * Both snake_case and camelCase tenant/id fields are populated so existing
 * readers (e.g. graph-service `RequestIdentity`) resolve identity unchanged.
 */
export interface CanonicalPrincipal {
  id: string;
  sub: string;
  tenant_id?: string;
  tenantId?: string;
  email?: string;
  roles: string[];
  groups: string[];
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  return [];
}

/**
 * Map a verified JWT payload to a {@link CanonicalPrincipal}. Tenant and role
 * claim names are configurable via `OIDC_TENANT_CLAIM` / `OIDC_ROLES_CLAIM`
 * (defaults cover common providers: `tenant_id`/`org_id`, `roles`).
 */
export function normalizePrincipal(payload: Record<string, unknown>): CanonicalPrincipal {
  const tenantClaim = process.env.OIDC_TENANT_CLAIM;
  const rolesClaim = process.env.OIDC_ROLES_CLAIM;
  const groupsClaim = process.env.OIDC_GROUPS_CLAIM;

  const id = firstString(
    payload.id,
    payload.sub,
    payload.user_id,
    payload.userId,
  );
  const sub = firstString(payload.sub, payload.id) ?? id ?? '';

  const tenant = firstString(
    tenantClaim ? payload[tenantClaim] : undefined,
    payload.tenant_id,
    payload.tenantId,
    payload.org_id,
    payload.orgId,
  );

  // Keycloak-style realm roles live under realm_access.roles.
  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const roles = [
    ...stringArray(rolesClaim ? payload[rolesClaim] : undefined),
    ...stringArray(payload.roles),
    ...stringArray(realmAccess?.roles),
  ];

  const groups = [
    ...stringArray(groupsClaim ? payload[groupsClaim] : undefined),
    ...stringArray(payload.groups),
  ];

  return {
    id: id ?? sub,
    sub,
    tenant_id: tenant,
    tenantId: tenant,
    email: firstString(payload.email),
    roles: Array.from(new Set(roles)),
    groups: Array.from(new Set(groups)),
  };
}

/**
 * Optional hook (DI token {@link MEMBERSHIP_VERIFIER}) that lets the guard deny
 * a token whose subject has no active membership in the resolved tenant. Kept as
 * a narrow interface so the `rest` guard does not depend at runtime on a
 * specific persistence package; the server wires a concrete implementation.
 */
export interface MembershipVerifier {
  /**
   * Returns the durable principal id when `subject` is an active member of
   * `tenantId`, or `null` when there is no resolvable active membership.
   */
  resolveActiveMember(tenantId: string, subject: string): Promise<{ principalId: string } | null>;
}

export const MEMBERSHIP_VERIFIER = 'MEMBERSHIP_VERIFIER';
