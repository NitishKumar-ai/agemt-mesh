import { describe, it, expect } from 'vitest';
import { bootstrapServer } from '../src/index.js';
import { policyEngine } from '@agentmesh/graph-service';
import crypto from 'node:crypto';

describe('Phase 3 Trust Layer E2E Integration tests', () => {
  it('should support graph ingestion, bitemporal facts, human corrections, and trust workflows', async () => {
    const port = 18081;
    const serverUrl = `http://localhost:${port}`;
    const tenantId = 'org_trust_e2e';
    const principalId = 'user_staff';

    policyEngine.grantAccess({
      tenant_id: tenantId,
      user_id: principalId,
      permission_hashes: ['correction-submit'],
      is_admin: true,
    });

    const { close } = await bootstrapServer({
      port,
      dbPath: ':memory:',
      installSignalHandlers: false,
      trustedPrincipal: { id: principalId, tenant_id: tenantId },
    });

    try {
      const projectId = crypto.randomUUID();
      const sourceId1 = 'source_notion_roadmap';
      const sourceId2 = 'source_meeting_note';

      // 1. Ingest Project and Source Nodes
      const projectNode = {
        id: projectId,
        tenant_id: tenantId,
        type: 'Project',
        canonical_name: 'Payments Revamp',
        aliases: ['Payment Migration'],
        source_system: 'notion',
        source_id: 'notion_page_123',
        confidence: 0.95,
        status: 'current',
        last_seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        properties: {},
      };

      const sourceNode1 = {
        id: sourceId1,
        tenant_id: tenantId,
        type: 'Source',
        title: 'Old Notion Roadmap',
        source_system: 'notion',
        source_id: 'notion_roadmap_file',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const sourceNode2 = {
        id: sourceId2,
        tenant_id: tenantId,
        type: 'Source',
        title: 'Roadmap sync notes June 7',
        source_system: 'notion',
        source_id: 'notion_sync_notes',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const ingestNodeRes1 = await fetch(`${serverUrl}/api/graph/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectNode),
      });
      expect(ingestNodeRes1.ok).toBe(true);

      await fetch(`${serverUrl}/api/graph/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceNode1),
      });

      await fetch(`${serverUrl}/api/graph/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceNode2),
      });

      // 2. Ingest first fact: launch is July 15
      const fact1 = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        entity_id: projectId,
        predicate: 'deadline',
        value: '2026-07-15',
        confidence: 0.8,
        status: 'current',
        valid_from: '2026-06-01T00:00:00Z',
        valid_to: null,
        recorded_from: '2026-06-02T10:00:00Z',
        recorded_to: null,
        source_id: sourceId1,
        evidence_spans: ['Target is July 15'],
        last_seen_at: new Date().toISOString(),
      };

      const ingestFactRes1 = await fetch(`${serverUrl}/api/graph/facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fact1),
      });
      expect(ingestFactRes1.ok).toBe(true);

      // Verify current facts
      const currentFactsRes1 = await fetch(`${serverUrl}/api/graph/facts/current?entity_id=${projectId}&tenant_id=${tenantId}`);
      expect(currentFactsRes1.ok).toBe(true);
      const currentFacts1 = await currentFactsRes1.json();
      expect(currentFacts1).toHaveLength(1);
      expect(currentFacts1[0].value).toBe('2026-07-15');

      // 3. Ingest newer fact: launch is August 1
      const fact2 = {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        entity_id: projectId,
        predicate: 'deadline',
        value: '2026-08-01',
        confidence: 0.9,
        status: 'current',
        valid_from: '2026-06-07T00:00:00Z', // newer valid time
        valid_to: null,
        recorded_from: '2026-06-08T10:00:00Z',
        recorded_to: null,
        source_id: sourceId2,
        evidence_spans: ['Move launch to August 1'],
        last_seen_at: new Date().toISOString(),
      };

      const ingestFactRes2 = await fetch(`${serverUrl}/api/graph/facts?authorityMap=${encodeURIComponent(JSON.stringify({ [sourceId1]: 0.5, [sourceId2]: 0.8 }))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fact2),
      });
      expect(ingestFactRes2.ok).toBe(true);

      // Verify temporal current and history
      const currentFactsRes2 = await fetch(`${serverUrl}/api/graph/facts/current?entity_id=${projectId}&tenant_id=${tenantId}`);
      const currentFacts2 = await currentFactsRes2.json();
      expect(currentFacts2).toHaveLength(1);
      expect(currentFacts2[0].value).toBe('2026-08-01'); // August 1 is now current

      const historyRes = await fetch(`${serverUrl}/api/graph/facts/history?entity_id=${projectId}&tenant_id=${tenantId}`);
      const history = await historyRes.json();
      expect(history).toHaveLength(2);

      // 4. Submit Human Invalidation Correction
      const correctRes = await fetch(`${serverUrl}/api/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: 'caller-controlled-user',
          correction_type: 'FACT_INVALIDATE',
          target_type: 'fact',
          target_id: currentFacts2[0].id,
          reason: 'No official deadline sets anymore',
        }),
      });
      expect(correctRes.ok).toBe(true);
      const correctionReport = await correctRes.json();
      expect(correctionReport.status).toBe('applied');

      // Verify that no facts are current anymore
      const currentFactsRes3 = await fetch(`${serverUrl}/api/graph/facts/current?entity_id=${projectId}&tenant_id=${tenantId}`);
      const currentFacts3 = await currentFactsRes3.json();
      expect(currentFacts3).toHaveLength(0);

      // Verify correct audit log exists
      const auditRes = await fetch(`${serverUrl}/api/correct/audit?tenant_id=${tenantId}`);
      expect(auditRes.ok).toBe(true);
      const auditLog = await auditRes.json();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].correction_type).toBe('FACT_INVALIDATE');
      expect(auditLog[0].user_id).toBe(principalId);

      // 5. Test Trust Workflows: Weekly Digest
      const weeklyDigestRes = await fetch(`${serverUrl}/api/workflows/weekly-digest?tenant_id=${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team: 'Engineering',
          dateRange: {
            from: '2026-06-01T00:00:00Z',
            to: '2026-06-15T00:00:00Z',
          },
        }),
      });
      expect(weeklyDigestRes.ok).toBe(true);
      const digest = await weeklyDigestRes.json();
      expect(digest.workflow_id).toBe('weekly_digest');
      expect(digest.sections[0].title).toBe('What Changed');

      // 6. Test Query Answering with low-confidence / contradiction abstention
      const queryRes = await fetch(`${serverUrl}/api/workflows/query?tenant_id=${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'When are we launching payments revamp?',
          projectId,
        }),
      });
      expect(queryRes.ok).toBe(true);
      const queryResult = await queryRes.json();
      expect(queryResult.level).toBe('abstain'); // Because we invalidated the facts, it will abstain due to lack of evidence
      expect(queryResult.answer).toContain('not enough evidence');

    } finally {
      await close();
      policyEngine.revokeAccess(tenantId, principalId);
    }
  }, 25000);
});
