import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import type { SafetyStats, SafetyVerdict, SafetyEscalation } from './DashboardTypes.js';

export class SafetyService {
  constructor(private readonly db: Kysely<Database>) {}

  async getStats(): Promise<SafetyStats> {
    const verdictRows = await this.db.selectFrom('safety_verdicts').selectAll().execute();
    const escalationRows = await this.db
      .selectFrom('safety_escalations')
      .select('resolved')
      .execute();

    const total = verdictRows.length;
    const byVerdict: Record<string, number> = {};
    const byRiskTier: Record<string, number> = {};
    let confidenceSum = 0;
    let durationSum = 0;
    let counterfactualBlocks = 0;

    for (const row of verdictRows) {
      byVerdict[row.verdict] = (byVerdict[row.verdict] ?? 0) + 1;
      byRiskTier[row.risk_tier] = (byRiskTier[row.risk_tier] ?? 0) + 1;
      confidenceSum += row.confidence;
      durationSum += row.eval_duration_ms;
      if (row.counterfactual_flag) counterfactualBlocks += 1;
    }

    const openEscalations = escalationRows.filter((row) => !row.resolved).length;

    return {
      total_evaluations: total,
      by_verdict: byVerdict,
      by_risk_tier: byRiskTier,
      avg_confidence: total > 0 ? confidenceSum / total : 0,
      avg_eval_duration_ms: total > 0 ? durationSum / total : 0,
      counterfactual_blocks: counterfactualBlocks,
      open_escalations: openEscalations,
    };
  }

  async listVerdicts(runId?: string): Promise<SafetyVerdict[]> {
    let query = this.db.selectFrom('safety_verdicts').selectAll();
    if (runId) {
      query = query.where('run_id', '=', runId);
    }
    const rows = await query.orderBy('created_at', 'desc').execute();

    return rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      agent_id: row.agent_id,
      frame_hash: row.frame_hash,
      verdict: row.verdict as SafetyVerdict['verdict'],
      confidence: row.confidence,
      reasoning: row.reasoning,
      checks: JSON.parse(row.checks),
      risk_tier: row.risk_tier as SafetyVerdict['risk_tier'],
      recursion_depth: row.recursion_depth,
      counterfactual_flag: !!row.counterfactual_flag,
      critic_model: row.critic_model,
      eval_duration_ms: row.eval_duration_ms,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async listEscalations(resolved?: boolean): Promise<SafetyEscalation[]> {
    let query = this.db.selectFrom('safety_escalations').selectAll();
    if (resolved !== undefined) {
      query = query.where('resolved', '=', resolved ? 1 : 0);
    }
    const rows = await query.orderBy('created_at', 'desc').execute();

    return rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      agent_id: row.agent_id,
      frame_hash: row.frame_hash,
      verdict_id: row.verdict_id,
      escalation_type: row.escalation_type,
      resolved: !!row.resolved,
      resolved_by: row.resolved_by,
      resolution: row.resolution,
      created_at: new Date(row.created_at).toISOString(),
      resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    }));
  }

  async resolveEscalation(
    id: number,
    body: { resolution: string; resolved_by: string },
  ): Promise<{ status: string }> {
    const escalation = await this.db
      .selectFrom('safety_escalations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!escalation) {
      throw new NotFoundException(`Escalation ${id} not found`);
    }
    if (escalation.resolved) {
      throw new ConflictException(`Escalation ${id} is already resolved`);
    }

    await this.db
      .updateTable('safety_escalations')
      .set({
        resolved: 1,
        resolved_by: body.resolved_by,
        resolution: body.resolution,
        resolved_at: Date.now(),
      })
      .where('id', '=', id)
      .execute();

    return { status: 'ok' };
  }
}
