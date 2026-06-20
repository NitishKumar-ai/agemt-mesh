import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  Fact,
  graphService,
  GraphNode,
  neo4jClient,
  policyEngine,
  PolicyEngine,
} from '@agentmesh/graph-service';
import { TrustWorkflowService } from '../src/services/TrustWorkflowService.js';
import { WorkflowController } from '../src/api/workflow.controller.js';

const tenantId = 'org_workflow_production_policy';
const now = '2026-06-10T00:00:00.000Z';

function node(type: GraphNode['type'], name: string, sourceId = `${name}_source`): GraphNode {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    type,
    canonical_name: name,
    aliases: [],
    source_system: 'test',
    source_id: sourceId,
    confidence: 1,
    status: 'current',
    created_at: now,
    updated_at: now,
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    last_seen_at: now,
    permissions_hash: null,
    source_url: null,
    properties: {},
  };
}

function source(sourceId: string, permissionHash: string | null): GraphNode {
  return {
    ...node('Document', sourceId, sourceId),
    permissions_hash: permissionHash,
  };
}

function scopedFact(entityId: string, sourceId: string, value: string): Fact {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    entity_id: entityId,
    predicate: 'status',
    value,
    confidence: 0.9,
    status: 'current',
    valid_from: now,
    valid_to: null,
    recorded_from: now,
    recorded_to: null,
    source_id: sourceId,
    evidence_spans: [value],
    last_seen_at: now,
  };
}

function outputText(output: Awaited<ReturnType<TrustWorkflowService['generateOnboardingBrief']>>) {
  return output.sections.map((section) => section.content).join('\n');
}

describe('TrustWorkflowService production and permission policy', () => {
  let policy: PolicyEngine;
  let service: TrustWorkflowService;
  let team: GraphNode;
  let incident: GraphNode;
  let meeting: GraphNode;
  let account: GraphNode;

  beforeEach(async () => {
    await neo4jClient.clear();
    await graphService.clearSearchIndex();
    policyEngine.clear();
    policy = new PolicyEngine();
    service = new TrustWorkflowService(graphService, policy);

    team = node('Team', 'Engineering');
    incident = node('Incident', 'INC-42');
    meeting = node('Meeting', 'Roadmap Review');
    account = node('Account', 'Acme');

    for (const graphNode of [
      team,
      incident,
      meeting,
      account,
      source('public_source', null),
      source('restricted_source', 'executive'),
    ]) {
      await graphService.ingestNode(graphNode);
    }

    for (const scope of [team, incident, meeting, account]) {
      await neo4jClient.upsertFact(scopedFact(scope.id, 'public_source', `PUBLIC_${scope.type}`));
      await neo4jClient.upsertFact(
        scopedFact(scope.id, 'restricted_source', `RESTRICTED_${scope.type}`),
      );
      await neo4jClient.upsertFact(scopedFact(scope.id, 'unknown_source', `UNKNOWN_${scope.type}`));
    }
  });

  it('uses GraphService public reads and has no direct in-memory-map dependency', () => {
    const sourceText = readFileSync(
      new URL('../src/services/TrustWorkflowService.ts', import.meta.url),
      'utf8',
    );
    expect(sourceText).not.toContain('neo4jClient');
    expect(sourceText).not.toMatch(/getInMemory(?:Facts|Nodes|Relationships)/);
    expect(sourceText).toContain('this.graphSvc.getFactsCurrent');
    expect(sourceText).toContain('this.graphSvc.getFactsChanges');
  });

  it('keeps all five workflow outputs anonymous-public and citation aligned', async () => {
    const outputs = await Promise.all([
      service.generateOnboardingBrief(tenantId, undefined, {
        user: 'New Hire',
        team: team.id,
        role: 'Engineer',
      }),
      service.generateWeeklyDigest(tenantId, undefined, {
        team: team.id,
        dateRange: { from: now, to: now },
      }),
      service.generateIncidentBrief(tenantId, undefined, {
        incidentId: incident.id,
        service: 'missing-service',
      }),
      service.generateMeetingPrep(tenantId, undefined, {
        eventTitle: meeting.id,
        attendees: [],
      }),
      service.generateAccountSummary(tenantId, undefined, {
        accountName: account.id,
      }),
    ]);

    for (const output of outputs) {
      const text = outputText(output);
      expect(text).toContain('PUBLIC_');
      expect(text).not.toContain('RESTRICTED_');
      expect(text).not.toContain('UNKNOWN_');
      expect(output.citations.map((citation) => citation.source_id)).toEqual(['public_source']);
    }
  });

  it('allows granted and admin callers to see mapped restrictions but never unknown sources', async () => {
    policy.grantAccess({
      tenant_id: tenantId,
      user_id: 'granted_user',
      permission_hashes: ['executive'],
    });
    policy.grantAccess({
      tenant_id: tenantId,
      user_id: 'admin_user',
      permission_hashes: [],
      is_admin: true,
    });

    for (const userId of ['granted_user', 'admin_user']) {
      const output = await service.generateAccountSummary(tenantId, userId, {
        accountName: account.id,
      });
      const text = outputText(output);
      expect(text).toContain('PUBLIC_Account');
      expect(text).toContain('RESTRICTED_Account');
      expect(text).not.toContain('UNKNOWN_Account');
      expect(output.citations.map((citation) => citation.source_id).sort()).toEqual([
        'public_source',
        'restricted_source',
      ]);
    }
  });

  it('keeps controller calls anonymous when identity appears only in headers', async () => {
    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: 'granted_user',
      permission_hashes: ['executive'],
    });
    const controller = new WorkflowController();
    const output = await controller.getWeeklyDigest(
      {
        team: team.id,
        dateRange: { from: now, to: now },
      },
      {
        headers: { 'x-user-id': 'granted_user' },
        user: { tenant_id: tenantId },
      } as any,
    );

    expect(outputText(output)).not.toContain('RESTRICTED_Team');
  });
});
