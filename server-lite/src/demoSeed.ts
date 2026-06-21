/**
 * Demo bootstrap (hackathon MVP) — permission-aware company brain.
 *
 * Enabled only when DEMO_AUTH / DEMO_SEED env flags are set (on by default
 * outside production). It:
 *
 *  1. Seeds an in-memory company brain (sources + temporal facts) where some
 *     sources are PUBLIC and others are ACL-restricted (eng / sales).
 *  2. Seeds representative principals with different access grants in the real
 *     PolicyEngine so permission behavior can be exercised by tests and trusted
 *     server-side authentication.
 *
 * Auth here is a demo affordance, not production OAuth/OIDC. Tokens are signed
 * with JWT_SECRET (the same secret the OidcAuthGuard verifies against), so the
 * normal guard + PolicyEngine path is exercised end-to-end.
 */
import crypto from 'node:crypto';
import { graphService, policyEngine, type Fact, type GraphNode } from '@agentmesh/graph-service';

export const DEMO_TENANT = 'demo-tenant';
export const DEMO_USER = 'demo-admin';

/** Trusted fallback identity installed when a request carries no token. */
export const DEMO_PRINCIPAL = {
  id: DEMO_USER,
  sub: DEMO_USER,
  user_id: DEMO_USER,
  tenant_id: DEMO_TENANT,
  tenantId: DEMO_TENANT,
  email: 'demo@agentmesh.dev',
  roles: ['admin'],
  groups: [],
};

// Permission-hash labels carried on restricted sources. A user sees a restricted
// fact only if their access grant includes the matching hash (or they're admin).
const ENG_ACL = 'confidential-eng';
const SALES_ACL = 'confidential-sales';

interface DemoPrincipalFixture {
  key: string;
  name: string;
  role: string;
  description: string;
  isAdmin: boolean;
  permissionHashes: string[];
}

/** Representative principals used by demo ACL fixtures and permission tests. */
export const DEMO_PRINCIPALS: DemoPrincipalFixture[] = [
  {
    key: 'priya',
    name: 'Priya Nair',
    role: 'Admin · Eng Manager',
    description: 'Tenant admin — sees every source.',
    isAdmin: true,
    permissionHashes: [],
  },
  {
    key: 'sam',
    name: 'Sam Okoye',
    role: 'Engineering',
    description: 'Sees public + engineering-confidential sources.',
    isAdmin: false,
    permissionHashes: [ENG_ACL],
  },
  {
    key: 'dana',
    name: 'Dana Lee',
    role: 'Sales',
    description: 'Sees public + sales-confidential sources.',
    isAdmin: false,
    permissionHashes: [SALES_ACL],
  },
  {
    key: 'riley',
    name: 'Riley Chen',
    role: 'Contractor (external)',
    description: 'Sees public sources only — restricted material fails closed.',
    isAdmin: false,
    permissionHashes: [],
  },
];

// ---- Minimal HS256 JWT signing (dependency-free; matches OidcAuthGuard) ----

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Verify a Bearer token (HS256 / JWT_SECRET) and project it into a request
 * principal. Returns null for a missing/malformed/expired/invalid token. Used so
 * routes that are not behind the Nest guard still honour verified identities.
 */
export function principalFromAuthHeader(
  header: string | undefined,
): Record<string, unknown> | null {
  if (!header) return null;
  const parts = header.split(' ');
  const token = parts[1];
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !token) return null;
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  const secret = process.env.JWT_SECRET || 'super-secret-key-change-me';
  const expected = base64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  if (expected !== sig) return null;
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
  const tenant = payload.tenant_id ?? payload.tenantId ?? payload.org_id;
  return {
    id: payload.id ?? payload.sub,
    sub: payload.sub ?? payload.id,
    user_id: payload.id ?? payload.sub,
    tenant_id: tenant,
    tenantId: tenant,
    email: payload.email,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    groups: [],
  };
}

const now = new Date().toISOString();
const recent = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

function sourceNode(
  sourceId: string,
  type: GraphNode['type'],
  name: string,
  permissionsHash: string | null,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    tenant_id: DEMO_TENANT,
    type,
    canonical_name: name,
    aliases: [],
    source_system: sourceId.split('-')[1] ?? 'connector',
    source_id: sourceId,
    confidence: 0.95,
    status: 'current',
    created_at: now,
    updated_at: now,
    valid_from: recent(30),
    valid_to: null,
    recorded_from: recent(30),
    recorded_to: null,
    last_seen_at: now,
    permissions_hash: permissionsHash, // null = public; otherwise ACL-gated
    source_url: null,
    properties: {},
  };
}

function fact(args: {
  entityId: string;
  predicate: string;
  value: unknown;
  sourceId: string;
  confidence: number;
  validFrom: string;
  evidence: string;
}): Fact {
  return {
    id: crypto.randomUUID(),
    tenant_id: DEMO_TENANT,
    entity_id: args.entityId,
    predicate: args.predicate,
    value: args.value,
    confidence: args.confidence,
    status: 'current',
    valid_from: args.validFrom,
    valid_to: null,
    recorded_from: args.validFrom,
    recorded_to: null,
    source_id: args.sourceId,
    evidence_spans: [args.evidence],
    last_seen_at: now,
  };
}

/**
 * Seed the demo company brain and representative ACL principals. Safe to call once after the
 * HTTP server is listening.
 */
export async function runDemoSeed(): Promise<void> {
  // --- Identities & access grants (real PolicyEngine) ---
  // Fallback admin used for token-less requests.
  policyEngine.grantAccess({
    tenant_id: DEMO_TENANT,
    user_id: DEMO_USER,
    permission_hashes: [],
    is_admin: true,
  });
  for (const identity of DEMO_PRINCIPALS) {
    policyEngine.grantAccess({
      tenant_id: DEMO_TENANT,
      user_id: identity.key,
      permission_hashes: identity.permissionHashes,
      is_admin: identity.isAdmin,
    });
  }

  // --- Sources (registers ACLs; null = public, label = restricted) ---
  const sources: GraphNode[] = [
    sourceNode('src-notion-roadmap', 'Document', 'Atlas Roadmap (Notion)', null),
    sourceNode('src-jira-epic', 'Ticket', 'ATLAS-128 Epic (Jira)', null),
    sourceNode('src-slack-standup', 'Message', '#atlas-standup (Slack)', null),
    sourceNode('src-eng-postmortem', 'Document', 'Atlas Security Post-mortem (Eng-only)', ENG_ACL),
    sourceNode('src-sales-forecast', 'Document', 'Atlas Renewal Forecast (Sales-only)', SALES_ACL),
    sourceNode('src-confluence-titan', 'Document', 'Titan Launch Plan (Confluence)', null),
    sourceNode('src-email-titan', 'Message', 'Titan launch email thread', null),
  ];
  for (const node of sources) {
    await graphService.ingestNode(node);
  }

  // --- Scope: project-atlas — mix of public + restricted facts ---
  const atlasFacts: Fact[] = [
    // Public — visible to everyone, including the external contractor.
    fact({
      entityId: 'project-atlas',
      predicate: 'status',
      value: 'On track for GA',
      sourceId: 'src-notion-roadmap',
      confidence: 0.95,
      validFrom: recent(3),
      evidence: 'Atlas is on track for GA; retrieval and permissions slices are complete.',
    }),
    fact({
      entityId: 'project-atlas',
      predicate: 'owner',
      value: 'Priya Nair (Eng Manager)',
      sourceId: 'src-jira-epic',
      confidence: 0.92,
      validFrom: recent(5),
      evidence: 'Epic ATLAS-128 owner: Priya Nair.',
    }),
    fact({
      entityId: 'project-atlas',
      predicate: 'deadline',
      value: '2026-08-15 (GA)',
      sourceId: 'src-notion-roadmap',
      confidence: 0.9,
      validFrom: recent(3),
      evidence: 'Target GA date 2026-08-15 per the roadmap.',
    }),
    // Engineering-confidential — only Priya (admin) and Sam (eng).
    fact({
      entityId: 'project-atlas',
      predicate: 'security_review',
      value: 'Pen-test found 2 high-severity auth gaps; remediation in progress',
      sourceId: 'src-eng-postmortem',
      confidence: 0.93,
      validFrom: recent(2),
      evidence: 'Security post-mortem: two high-severity auth gaps, fixes tracked in ATLAS-141.',
    }),
    fact({
      entityId: 'project-atlas',
      predicate: 'incident_root_cause',
      value: 'Sev-2 outage caused by an ACL cache race condition',
      sourceId: 'src-eng-postmortem',
      confidence: 0.91,
      validFrom: recent(2),
      evidence: 'RCA: Sev-2 traced to a race in the permission (ACL) cache.',
    }),
    // Sales-confidential — only Priya (admin) and Dana (sales).
    fact({
      entityId: 'project-atlas',
      predicate: 'revenue_at_risk',
      value: '$1.2M ARR renewal is gated on GA shipping by Q3',
      sourceId: 'src-sales-forecast',
      confidence: 0.9,
      validFrom: recent(4),
      evidence: 'Renewal forecast: $1.2M ARR contingent on GA in Q3.',
    }),
    fact({
      entityId: 'project-atlas',
      predicate: 'exec_sponsor',
      value: 'Executive champion: VP Engineering at Globex',
      sourceId: 'src-sales-forecast',
      confidence: 0.88,
      validFrom: recent(6),
      evidence: 'Account notes: VP Eng at Globex is the executive sponsor.',
    }),
  ];
  for (const f of atlasFacts) {
    await graphService.ingestFact(f);
  }

  // --- Scope: project-titan — conflicting public sources => abstention ---
  const titanValidFrom = recent(4);
  await graphService.ingestFact(
    fact({
      entityId: 'project-titan',
      predicate: 'launch_date',
      value: '2026-07-01',
      sourceId: 'src-confluence-titan',
      confidence: 0.85,
      validFrom: titanValidFrom,
      evidence: 'Confluence launch plan lists 2026-07-01.',
    }),
  );
  await graphService.ingestFact(
    fact({
      entityId: 'project-titan',
      predicate: 'launch_date',
      value: '2026-09-15',
      sourceId: 'src-email-titan',
      confidence: 0.85,
      validFrom: titanValidFrom, // same valid_from + equal authority => contradiction
      evidence: 'Email thread states the launch slips to 2026-09-15.',
    }),
  );

  // eslint-disable-next-line no-console
  console.log(
    `[DemoSeed] Seeded tenant "${DEMO_TENANT}": project-atlas (public + eng/sales-restricted facts), ` +
      `project-titan (contradiction), and ${DEMO_PRINCIPALS.length} ACL test principals.`,
  );
}
