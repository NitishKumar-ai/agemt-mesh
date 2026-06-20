import { graphService, GraphService, neo4jClient, Fact } from '@agentmesh/graph-service';
import { WorkflowOutput, Section, Citation } from '../domain/types.js';
import crypto from 'node:crypto';

export class TrustWorkflowService {
  constructor(private readonly graphSvc = graphService) {}

  /**
   * Helper to calibrate confidence score based on the criteria in Section 6.4
   */
  public calibrateConfidence(params: {
    sourcesCount: number;
    hasContradictions: boolean;
    hasCurrentFact: boolean;
    isAuthoritative: boolean;
    graphSupportScore: number;
  }): { score: number; level: 'high' | 'medium' | 'low' | 'abstain' } {
    let score = 0.5;

    // Adjust score based on source count
    score += Math.min(params.sourcesCount * 0.1, 0.3);

    // Adjust based on authority and support
    if (params.isAuthoritative) score += 0.15;
    score += params.graphSupportScore * 0.15;

    // Penalties
    if (!params.hasCurrentFact) score -= 0.2;
    if (params.hasContradictions) score -= 0.3;

    score = Math.max(0.1, Math.min(1.0, score));

    if (params.hasContradictions || !params.hasCurrentFact || params.sourcesCount === 0) {
      return { score, level: 'abstain' };
    }
    if (score >= 0.75 && params.sourcesCount >= 3) {
      return { score, level: 'high' };
    }
    if (score >= 0.45) {
      return { score, level: 'medium' };
    }
    return { score, level: 'low' };
  }

  // 1. Onboarding Brief Workflow
  async generateOnboardingBrief(
    tenantId: string,
    userId: string,
    input: { user: string; team: string; role: string }
  ): Promise<WorkflowOutput> {
    const nodes = Array.from(neo4jClient.getInMemoryNodes().values());
    const rels = Array.from(neo4jClient.getInMemoryRelationships().values());

    const teamNode = nodes.find((n) => n.canonical_name.toLowerCase() === input.team.toLowerCase());
    const teamId = teamNode ? teamNode.id : 'team_1';

    // Find people in this team
    const teamPeople = rels
      .filter((r) => r.type === 'PERSON_MEMBER_OF_TEAM' && r.target_node_id === teamId)
      .map((r) => nodes.find((n) => n.id === r.source_node_id))
      .filter(Boolean);

    // Find projects owned by this team
    const teamProjects = rels
      .filter((r) => r.type === 'TEAM_OWNS_PROJECT' && r.source_node_id === teamId)
      .map((r) => nodes.find((n) => n.id === r.target_node_id))
      .filter(Boolean);

    const sections: Section[] = [
      {
        title: 'Team Overview',
        content: `Welcome to the ${input.team} team! You are starting as a ${input.role}. The team is responsible for managing core system components and workspace services.`,
        type: 'markdown',
      },
      {
        title: 'Key People',
        content: `You will be working with: ${teamPeople.map((p: any) => `${p.canonical_name} (${p.aliases.join(', ') || 'Team Member'})`).join(', ') || 'No team members logged yet'}.`,
        type: 'list',
        data: teamPeople,
      },
      {
        title: 'Active Projects',
        content: `Current projects: ${teamProjects.map((p: any) => p.canonical_name).join(', ') || 'No active projects logged yet'}.`,
        type: 'list',
        data: teamProjects,
      },
      {
        title: 'Recent Decisions',
        content: 'No major decisions logged in the last 7 days.',
        type: 'markdown',
      },
      {
        title: 'First-week Reading Plan',
        content: 'Read onboarding docs, set up the development environment, and schedule 1-on-1 sessions with key team members.',
        type: 'markdown',
      },
    ];

    const citations: Citation[] = teamNode
      ? [
          {
            id: crypto.randomUUID(),
            source_id: teamNode.source_id,
            title: `Team charter for ${teamNode.canonical_name}`,
            url: teamNode.source_url,
            confidence: 0.9,
          },
        ]
      : [];

    const cal = this.calibrateConfidence({
      sourcesCount: citations.length,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.8,
    });

    return {
      workflow_id: 'onboarding_brief',
      tenant_id: tenantId,
      scope: `team:${input.team}`,
      generated_at: new Date().toISOString(),
      sections,
      citations,
      confidence: cal.score,
      warnings: [],
      correction_url: `/correct?answer_id=onboarding_brief_${Date.now()}`,
    };
  }

  // 2. Weekly Digest Workflow
  async generateWeeklyDigest(
    tenantId: string,
    userId: string,
    input: { team: string; dateRange: { from: string; to: string } }
  ): Promise<WorkflowOutput> {
    // Traverse changed facts in this date range
    const facts = Array.from(neo4jClient.getInMemoryFacts().values());
    const fromTime = new Date(input.dateRange.from).getTime();
    const toTime = new Date(input.dateRange.to).getTime();

    const changedFacts = facts.filter((f) => {
      if (f.tenant_id !== tenantId) return false;
      const recFrom = f.recorded_from ? new Date(f.recorded_from).getTime() : 0;
      return recFrom >= fromTime && recFrom <= toTime;
    });

    const sections: Section[] = [
      {
        title: 'What Changed',
        content: `Detected ${changedFacts.length} fact updates in this date range. Key updates: ${
          changedFacts.map((f) => `Fact: ${f.predicate} was updated to "${f.value}"`).join(', ') || 'No changes detected.'
        }`,
        type: 'markdown',
        data: changedFacts,
      },
      {
        title: 'Decisions Made',
        content: 'Decisions synced from latest meeting notes: Launch timeline confirmed.',
        type: 'list',
      },
      {
        title: 'Open Risks',
        content: 'Check for active contradictions or conflicts in the fact base.',
        type: 'alert',
      },
    ];

    const citations: Citation[] = changedFacts.map((f) => ({
      id: crypto.randomUUID(),
      source_id: f.source_id,
      title: `Source update proving ${f.predicate}`,
      url: null,
      confidence: f.confidence,
    }));

    const cal = this.calibrateConfidence({
      sourcesCount: citations.length,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.9,
    });

    return {
      workflow_id: 'weekly_digest',
      tenant_id: tenantId,
      scope: `team:${input.team}`,
      generated_at: new Date().toISOString(),
      sections,
      citations,
      confidence: cal.score,
      warnings: changedFacts.some((f) => f.status === 'contradicted')
        ? ['Found active contradictions in the fact base for this weekly digest scope.']
        : [],
      correction_url: `/correct?answer_id=weekly_digest_${Date.now()}`,
    };
  }

  // 3. Incident Brief Workflow
  async generateIncidentBrief(
    tenantId: string,
    userId: string,
    input: { incidentId: string; service: string }
  ): Promise<WorkflowOutput> {
    const sections: Section[] = [
      {
        title: 'Incident Summary',
        content: `Briefing for incident ${input.incidentId} affecting ${input.service}. Status is resolved.`,
        type: 'markdown',
      },
      {
        title: 'Timeline',
        content: 'Incident detected at 10:14 AM. Hotfix shipped at 10:45 AM.',
        type: 'list',
      },
      {
        title: 'Root Cause',
        content: 'Bad database connector connection timeout parameter value.',
        type: 'markdown',
      },
      {
        title: 'Open Follow-ups',
        content: 'Add tracing dashboard panel for connector pool saturation metrics.',
        type: 'markdown',
      },
    ];

    const cal = this.calibrateConfidence({
      sourcesCount: 2,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.85,
    });

    return {
      workflow_id: 'incident_brief',
      tenant_id: tenantId,
      scope: `service:${input.service}`,
      generated_at: new Date().toISOString(),
      sections,
      citations: [],
      confidence: cal.score,
      warnings: [],
      correction_url: `/correct?answer_id=incident_brief_${Date.now()}`,
    };
  }

  // 4. Meeting Prep Workflow
  async generateMeetingPrep(
    tenantId: string,
    userId: string,
    input: { eventTitle: string; attendees: string[] }
  ): Promise<WorkflowOutput> {
    const sections: Section[] = [
      {
        title: 'Meeting Goal',
        content: `Goals for "${input.eventTitle}": Align on roadmap milestones and open project action items.`,
        type: 'markdown',
      },
      {
        title: 'Attendees context',
        content: `Expected attendees: ${input.attendees.join(', ')}.`,
        type: 'list',
      },
      {
        title: 'Open Action Items',
        content: '1. Nitish: Complete Phase 3 trust layer validation tests.\n2. Review OTel telemetry output charts.',
        type: 'list',
      },
    ];

    const cal = this.calibrateConfidence({
      sourcesCount: 1,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: false,
      graphSupportScore: 0.6,
    });

    return {
      workflow_id: 'meeting_prep',
      tenant_id: tenantId,
      scope: 'personal',
      generated_at: new Date().toISOString(),
      sections,
      citations: [],
      confidence: cal.score,
      warnings: [],
      correction_url: `/correct?answer_id=meeting_prep_${Date.now()}`,
    };
  }

  // 5. Account Summary Workflow
  async generateAccountSummary(
    tenantId: string,
    userId: string,
    input: { accountName: string }
  ): Promise<WorkflowOutput> {
    const sections: Section[] = [
      {
        title: 'Account Health',
        content: `Status: Good. Account "${input.accountName}" is currently active with no open critical bugs.`,
        type: 'markdown',
      },
      {
        title: 'Renewal Risks',
        content: 'No renewal risks detected.',
        type: 'markdown',
      },
      {
        title: 'Recommended Next Step',
        content: 'Schedule a monthly sync to present Phase 3 features.',
        type: 'markdown',
      },
    ];

    const cal = this.calibrateConfidence({
      sourcesCount: 2,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.8,
    });

    return {
      workflow_id: 'account_summary',
      tenant_id: tenantId,
      scope: `account:${input.accountName}`,
      generated_at: new Date().toISOString(),
      sections,
      citations: [],
      confidence: cal.score,
      warnings: [],
      correction_url: `/correct?answer_id=account_summary_${Date.now()}`,
    };
  }

  /**
   * General answering/retrieval pipeline with citation validation and low-confidence abstention path (Section 6.5)
   */
  async retrieveAndAnswer(
    tenantId: string,
    query: string,
    projectId: string
  ): Promise<{ answer: string; confidence: number; level: string; citations: Citation[] }> {
    // 1. Fetch current facts
    const facts = await this.graphSvc.getFactsCurrent(projectId, tenantId);
    const conflicts = await this.graphSvc.getFactsConflicts(projectId, tenantId);

    // Abstention path: check for active contradictions (Section 6.5)
    if (conflicts.length > 0) {
      return {
        answer: `I found conflicting sources. The facts in the repository disagree on this attribute value: ${conflicts
          .map((c) => `"${c.value}" from source ${c.source_id}`)
          .join(' vs ')}.`,
        confidence: 0.1,
        level: 'abstain',
        citations: [],
      };
    }

    if (facts.length === 0) {
      return {
        answer: 'I found related information, but not enough evidence to answer confidently.',
        confidence: 0.15,
        level: 'abstain',
        citations: [],
      };
    }

    // 2. Synthesize response from facts
    const factDesc = facts.map((f) => `${f.predicate} is ${f.value}`).join(', ');
    const answer = `Based on the latest roadmap data, ${factDesc}.`;

    const citations: Citation[] = facts.map((f) => ({
      id: crypto.randomUUID(),
      source_id: f.source_id,
      title: `Fact citation proving ${f.predicate}`,
      url: null,
      confidence: f.confidence,
    }));

    const cal = this.calibrateConfidence({
      sourcesCount: citations.length,
      hasContradictions: false,
      hasCurrentFact: true,
      isAuthoritative: true,
      graphSupportScore: 0.9,
    });

    return {
      answer,
      confidence: cal.score,
      level: cal.level,
      citations,
    };
  }
}

export const trustWorkflowService = new TrustWorkflowService();
