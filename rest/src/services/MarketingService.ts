import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@agentmesh/common-persistence';
import { NotFoundException, ConflictException } from '@agentmesh/common';
import type { MarketingCampaign, MarketingAuditEvent } from './DashboardTypes.js';

export interface CreateCampaignRequest {
  name: string;
  audience: string;
  finding_summary: string;
  value_proposition: string;
  channel: string;
  source_finding_id?: number;
}

export class MarketingService {
  constructor(private readonly db: Kysely<Database>) {}

  private toCampaign(row: {
    id: number;
    source_finding_id: number | null;
    name: string;
    audience: string;
    finding_summary: string;
    value_proposition: string | null;
    channel: string;
    status: string;
    subject: string | null;
    body: string | null;
    approval_note: string | null;
    created_at: number;
    updated_at: number;
  }): MarketingCampaign {
    return {
      id: row.id,
      source_finding_id: row.source_finding_id ?? undefined,
      name: row.name,
      audience: row.audience,
      finding_summary: row.finding_summary,
      value_proposition: row.value_proposition ?? undefined,
      channel: row.channel as MarketingCampaign['channel'],
      status: row.status as MarketingCampaign['status'],
      subject: row.subject ?? undefined,
      body: row.body ?? undefined,
      approval_note: row.approval_note ?? undefined,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  async listCampaigns(): Promise<MarketingCampaign[]> {
    const rows = await this.db
      .selectFrom('marketing_campaigns')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => this.toCampaign(row));
  }

  async createCampaign(
    req: CreateCampaignRequest,
  ): Promise<{ status: string; campaign_id: number }> {
    const now = Date.now();
    const result = await this.db
      .insertInto('marketing_campaigns')
      .values({
        source_finding_id: req.source_finding_id ?? null,
        name: req.name,
        audience: req.audience,
        finding_summary: req.finding_summary,
        value_proposition: req.value_proposition ?? null,
        channel: req.channel,
        status: 'draft',
        subject: null,
        body: null,
        approval_note: null,
        created_at: now,
        updated_at: now,
      })
      .executeTakeFirst();

    const campaignId = Number(result.insertId);

    await this.logAudit('campaign', campaignId, 'created', 'operator', { name: req.name });

    return { status: 'ok', campaign_id: campaignId };
  }

  async generateCampaign(id: number): Promise<{ status: string; workflow_id: string }> {
    const campaign = await this.db
      .selectFrom('marketing_campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const workflowId = randomUUID();

    await this.db
      .updateTable('marketing_campaigns')
      .set({ status: 'review_required', updated_at: Date.now() })
      .where('id', '=', id)
      .execute();

    await this.logAudit('campaign', id, 'generate_started', 'operator', { workflow_id: workflowId });

    return { status: 'ok', workflow_id: workflowId };
  }

  async approveCampaign(id: number, note?: string): Promise<{ status: string }> {
    const campaign = await this.db
      .selectFrom('marketing_campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    if (campaign.status === 'approved') {
      throw new ConflictException(`Campaign ${id} is already approved`);
    }

    await this.db
      .updateTable('marketing_campaigns')
      .set({ status: 'approved', approval_note: note ?? null, updated_at: Date.now() })
      .where('id', '=', id)
      .execute();

    await this.logAudit('campaign', id, 'approved', 'operator', { note: note ?? '' });

    return { status: 'ok' };
  }

  async scheduleCampaign(
    id: number,
  ): Promise<{ status: string; method: string; typefully_id: string | null }> {
    const campaign = await this.db
      .selectFrom('marketing_campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    if (campaign.status !== 'approved') {
      throw new ConflictException(`Campaign ${id} must be approved before scheduling`);
    }

    await this.logAudit('campaign', id, 'scheduled', 'operator', {});

    return { status: 'ok', method: 'manual', typefully_id: null };
  }

  async listAuditEvents(): Promise<MarketingAuditEvent[]> {
    const rows = await this.db
      .selectFrom('marketing_audit_events')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      entity_type: row.entity_type as MarketingAuditEvent['entity_type'],
      entity_id: row.entity_id,
      action: row.action,
      actor: row.actor,
      payload: JSON.parse(row.payload),
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  private async logAudit(
    entityType: 'finding' | 'campaign',
    entityId: number,
    action: string,
    actor: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .insertInto('marketing_audit_events')
      .values({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor,
        payload: JSON.stringify(payload),
        created_at: Date.now(),
      })
      .execute();
  }
}
