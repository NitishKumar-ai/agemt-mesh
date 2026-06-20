/**
 * Minimal permission/policy engine. Closes the gap where `permissions_hash`
 * was stored on every GraphNode/source but never read or enforced anywhere —
 * queries could return facts sourced from restricted material regardless of
 * who was asking.
 *
 * Model: a grant ties (tenant_id, user_id) to the set of permission_hashes
 * that user is allowed to see, or marks them admin (sees everything in the
 * tenant). A fact/node with permissions_hash === null is always public.
 * A fact/node whose source was never registered via ingestNode is denied.
 * Unknown ACL state must fail closed so workflow and vector retrieval cannot
 * expose content before connector permission mapping has completed.
 */

import DatabaseDriver from 'better-sqlite3';

export interface AccessGrant {
  tenant_id: string;
  user_id: string;
  permission_hashes: string[];
  is_admin?: boolean;
}

export interface ResolvedAccess {
  allowedPermissionHashes: string[];
  isAdmin: boolean;
}

export class PolicyEngine {
  private dbInstance: any = null;

  constructor(db?: any) {
    if (db) {
      this.dbInstance = db;
      this.initializeSchema();
    }
  }

  private initializeSchema() {
    try {
      this.dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS user_access_grants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          permission_hash TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL
        )
      `);
    } catch (err) {
      // ignore
    }
  }

  private getDb() {
    if (!this.dbInstance) {
      const dbPath = process.env.DB_PATH || ':memory:';
      this.dbInstance = new DatabaseDriver(dbPath);
      this.initializeSchema();
    }
    return this.dbInstance;
  }

  grantAccess(grant: AccessGrant): void {
    const db = this.getDb();
    const now = Date.now();
    const isAdminVal = grant.is_admin ? 1 : 0;

    if (grant.permission_hashes && grant.permission_hashes.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO user_access_grants (tenant_id, user_id, permission_hash, is_admin, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const hash of grant.permission_hashes) {
        const existing = db.prepare(`
          SELECT id FROM user_access_grants 
          WHERE tenant_id = ? AND user_id = ? AND permission_hash = ?
        `).get(grant.tenant_id, grant.user_id, hash);

        if (existing) {
          if (grant.is_admin) {
            db.prepare(`
              UPDATE user_access_grants SET is_admin = 1 
              WHERE tenant_id = ? AND user_id = ? AND permission_hash = ?
            `).run(grant.tenant_id, grant.user_id, hash);
          }
        } else {
          stmt.run(grant.tenant_id, grant.user_id, hash, isAdminVal, now);
        }
      }
    } else if (grant.is_admin) {
      const existingAdminRow = db.prepare(`
        SELECT id FROM user_access_grants 
        WHERE tenant_id = ? AND user_id = ? AND is_admin = 1
      `).get(grant.tenant_id, grant.user_id);

      if (!existingAdminRow) {
        db.prepare(`
          INSERT INTO user_access_grants (tenant_id, user_id, permission_hash, is_admin, created_at)
          VALUES (?, ?, '', 1, ?)
        `).run(grant.tenant_id, grant.user_id, now);
      }
    }

    if (grant.is_admin) {
      db.prepare(`
        UPDATE user_access_grants SET is_admin = 1
        WHERE tenant_id = ? AND user_id = ?
      `).run(grant.tenant_id, grant.user_id);
    }
  }

  revokeAccess(tenantId: string, userId: string, permissionHash?: string): void {
    const db = this.getDb();
    if (!permissionHash) {
      db.prepare('DELETE FROM user_access_grants WHERE tenant_id = ? AND user_id = ?').run(tenantId, userId);
      return;
    }
    db.prepare('DELETE FROM user_access_grants WHERE tenant_id = ? AND user_id = ? AND permission_hash = ?')
      .run(tenantId, userId, permissionHash);
  }

  resolveAccess(tenantId: string, userId?: string): ResolvedAccess {
    if (!userId) return { allowedPermissionHashes: [], isAdmin: false };
    try {
      const db = this.getDb();
      const rows = db.prepare(
        'SELECT permission_hash, is_admin FROM user_access_grants WHERE tenant_id = ? AND user_id = ?'
      ).all(tenantId, userId) as { permission_hash: string; is_admin: number }[];

      const permissionHashes = new Set<string>();
      let isAdmin = false;

      for (const r of rows) {
        if (r.permission_hash) {
          permissionHashes.add(r.permission_hash);
        }
        if (r.is_admin === 1) {
          isAdmin = true;
        }
      }

      // Check group memberships if tables exist
      const hasGroups = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('group_memberships', 'group_access_grants')"
      ).all().length === 2;

      if (hasGroups) {
        const groupRows = db.prepare(`
          SELECT gag.permission_hash 
          FROM group_memberships gm
          JOIN group_access_grants gag ON gm.group_id = gag.group_id AND gm.tenant_id = gag.tenant_id
          WHERE gm.tenant_id = ? AND gm.principal_id = ?
        `).all(tenantId, userId) as { permission_hash: string }[];

        for (const r of groupRows) {
          if (r.permission_hash) {
            permissionHashes.add(r.permission_hash);
          }
        }
      }

      return { 
        allowedPermissionHashes: Array.from(permissionHashes), 
        isAdmin 
      };
    } catch (err) {
      return { allowedPermissionHashes: [], isAdmin: false };
    }
  }

  isVisible(permissionHash: string | null | undefined, access: ResolvedAccess): boolean {
    if (access.isAdmin) return true;
    if (permissionHash === null) return true;
    if (permissionHash === undefined) return false;
    return access.allowedPermissionHashes.includes(permissionHash);
  }

  clear(): void {
    const db = this.getDb();
    db.prepare('DELETE FROM user_access_grants').run();
  }
}

export const policyEngine = new PolicyEngine();
