/**
 * Durable identity & authorization access (Pass 1 / T4).
 *
 * This is the persistence surface authorization resolution depends on. It keeps
 * connector/service identities distinct from human users (`PrincipalType`), and
 * exposes the effective permission set a principal has, unioning direct grants
 * with grants inherited through group membership.
 */

export type PrincipalType = 'user' | 'service';

export const ADMIN_ROLE = 'admin';

export interface Principal {
  id: string;
  tenantId: string;
  principalType: PrincipalType;
  externalSubject?: string | null;
  email?: string | null;
  displayName?: string | null;
  status?: string;
  createdAt?: number;
}

export interface Group {
  id: string;
  tenantId: string;
  name: string;
  createdAt?: number;
}

/**
 * The effective authorization a principal holds in a tenant, after resolving
 * roles, direct grants, and group-inherited grants.
 */
export interface EffectiveAccess {
  /** True only when the principal has an active membership in the tenant. */
  isMember: boolean;
  isAdmin: boolean;
  roles: string[];
  /** Direct + group-inherited permission hashes (deduplicated). */
  permissionHashes: string[];
}

export interface IdentityDAO {
  // --- Principals ---
  upsertPrincipal(principal: Principal): Promise<Principal>;
  getPrincipalById(tenantId: string, principalId: string): Promise<Principal | undefined>;
  getPrincipalBySubject(tenantId: string, externalSubject: string): Promise<Principal | undefined>;

  // --- Tenant membership ---
  addMembership(tenantId: string, principalId: string): Promise<void>;
  /** Soft-removes membership (status -> 'removed') so it can be audited. */
  removeMembership(tenantId: string, principalId: string): Promise<void>;
  isActiveMember(tenantId: string, principalId: string): Promise<boolean>;

  // --- Roles ---
  /**
   * Assigns a role. Implementations MUST reject assigning {@link ADMIN_ROLE} to
   * a `service` principal so connector identities cannot assume human-admin
   * privileges.
   */
  assignRole(tenantId: string, principalId: string, role: string): Promise<void>;
  removeRole(tenantId: string, principalId: string, role: string): Promise<void>;
  getRoles(tenantId: string, principalId: string): Promise<string[]>;

  // --- Groups ---
  upsertGroup(group: Group): Promise<Group>;
  addGroupMember(tenantId: string, groupId: string, principalId: string): Promise<void>;
  removeGroupMember(tenantId: string, groupId: string, principalId: string): Promise<void>;
  getGroupsForPrincipal(tenantId: string, principalId: string): Promise<string[]>;
  grantGroupPermission(tenantId: string, groupId: string, permissionHash: string): Promise<void>;
  revokeGroupPermission(tenantId: string, groupId: string, permissionHash: string): Promise<void>;

  /**
   * Resolves the effective access for a principal: roles, admin flag, and the
   * union of direct grants (from `user_access_grants`) and group-inherited
   * grants. Returns `isMember: false` with no access when the principal has no
   * active tenant membership (fail-closed).
   */
  resolveEffectiveAccess(tenantId: string, principalId: string): Promise<EffectiveAccess>;
}
