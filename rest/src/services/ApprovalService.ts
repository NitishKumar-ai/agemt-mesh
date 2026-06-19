import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import type { ApprovalEvent, ApprovalHistoryEntry } from './DashboardTypes.js';

export class ApprovalService {
  constructor(private readonly db: Kysely<Database>) {}

  async listApprovals(): Promise<ApprovalEvent[]> {
    const rows = await this.db
      .selectFrom('approvals')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      payload: JSON.parse(row.payload),
      created_at: new Date(row.created_at).toISOString(),
      status: row.status as ApprovalEvent['status'],
      risk_level: row.risk_level as ApprovalEvent['risk_level'],
      requesting_agent: row.requesting_agent,
    }));
  }

  async getApprovalHistory(approvalId: number): Promise<ApprovalHistoryEntry[]> {
    const approval = await this.db
      .selectFrom('approvals')
      .select('id')
      .where('id', '=', approvalId)
      .executeTakeFirst();
    if (!approval) {
      throw new NotFoundException(`Approval ${approvalId} not found`);
    }

    const rows = await this.db
      .selectFrom('approval_history')
      .selectAll()
      .where('approval_id', '=', approvalId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => ({
      action: row.action,
      actor: row.actor,
      payload: JSON.parse(row.payload),
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async decideApproval(
    approvalId: number,
    body: { run_id: string; approved: boolean; note?: string },
  ): Promise<{ status: string; action: string }> {
    const approval = await this.db
      .selectFrom('approvals')
      .selectAll()
      .where('id', '=', approvalId)
      .executeTakeFirst();
    if (!approval) {
      throw new NotFoundException(`Approval ${approvalId} not found`);
    }
    if (approval.status !== 'pending') {
      throw new ConflictException(`Approval ${approvalId} is not pending`);
    }

    const action = body.approved ? 'approved' : 'rejected';
    const now = Date.now();

    await this.db
      .updateTable('approvals')
      .set({ status: action })
      .where('id', '=', approvalId)
      .execute();

    await this.db
      .insertInto('approval_history')
      .values({
        approval_id: approvalId,
        action,
        actor: 'operator',
        payload: JSON.stringify({ note: body.note ?? '' }),
        created_at: now,
      })
      .execute();

    return { status: 'ok', action };
  }
}
