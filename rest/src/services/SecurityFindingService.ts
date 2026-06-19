import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import type { SecurityFinding } from './DashboardTypes.js';

export class SecurityFindingService {
  constructor(private readonly db: Kysely<Database>) {}

  async listFindings(): Promise<SecurityFinding[]> {
    const rows = await this.db
      .selectFrom('security_findings')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      source_agent: row.source_agent,
      title: row.title,
      summary: row.summary,
      evidence: row.evidence,
      severity: row.severity as SecurityFinding['severity'],
      repository: row.repository ?? undefined,
      status: row.status as SecurityFinding['status'],
      verified_by: row.verified_by ?? undefined,
      verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async verifyFinding(id: number, verifiedBy: string): Promise<{ status: string }> {
    const finding = await this.db
      .selectFrom('security_findings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!finding) {
      throw new NotFoundException(`Finding ${id} not found`);
    }
    if (finding.status === 'verified') {
      throw new ConflictException(`Finding ${id} is already verified`);
    }

    await this.db
      .updateTable('security_findings')
      .set({ status: 'verified', verified_by: verifiedBy, verified_at: Date.now() })
      .where('id', '=', id)
      .execute();

    await this.db
      .insertInto('marketing_audit_events')
      .values({
        entity_type: 'finding',
        entity_id: id,
        action: 'verified',
        actor: verifiedBy,
        payload: JSON.stringify({}),
        created_at: Date.now(),
      })
      .execute();

    return { status: 'ok' };
  }
}
