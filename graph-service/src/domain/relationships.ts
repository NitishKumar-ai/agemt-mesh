import { z } from 'zod';
import { NodeStatusEnum } from './entities.js';

export const RelationshipTypeEnum = z.enum([
  'PERSON_MEMBER_OF_TEAM',
  'PERSON_OWNS_PROJECT',
  'PERSON_AUTHORED_DOCUMENT',
  'PERSON_ATTENDED_MEETING',
  'TEAM_OWNS_PROJECT',
  'PROJECT_HAS_DOCUMENT',
  'PROJECT_HAS_TASK',
  'PROJECT_DEPENDS_ON_PROJECT',
  'PROJECT_AFFECTS_CUSTOMER',
  'DOCUMENT_MENTIONS_ENTITY',
  'DOCUMENT_SUPPORTS_FACT',
  'DOCUMENT_SUPERSEDES_DOCUMENT',
  'FACT_SUPPORTED_BY_SOURCE',
  'FACT_CONTRADICTS_FACT',
  'FACT_SUPERSEDES_FACT',
  'FACT_INVALIDATED_BY_CORRECTION',
  'DECISION_MADE_IN_MEETING',
  'DECISION_AFFECTS_PROJECT',
  'TASK_BLOCKS_PROJECT',
  'INCIDENT_AFFECTS_SERVICE',
  'INCIDENT_CAUSED_BY_PR',
  'INCIDENT_HAS_FOLLOWUP_TASK',
  'ACCOUNT_HAS_OWNER',
  'ACCOUNT_HAS_RISK',
  'ACCOUNT_HAS_TICKET',
  'ACCOUNT_HAS_MEETING',
  'ENTITY_ALIAS_OF',
  'ENTITY_MERGED_INTO',
  // Growth Memory domain pack: campaign/feature intelligence edges. Additive.
  'CAMPAIGN_PROMOTES_FEATURE',
  'CAMPAIGN_RUNS_ON_CHANNEL',
  'CAMPAIGN_USES_CREATIVE',
  'CHANNEL_GENERATED_LEAD',
  'LEAD_BECAME_USER',
  'USER_PERFORMED_EVENT',
  'USER_GAVE_FEEDBACK',
  'USER_MADE_PAYMENT',
  'FEEDBACK_MENTIONS_FEATURE',
  'FEATURE_INFLUENCED_PAYMENT',
  'REPORT_CLAIMS_INSIGHT',
  'INSIGHT_SUPERSEDES_INSIGHT',
]);

export type RelationshipType = z.infer<typeof RelationshipTypeEnum>;

export const CorrectionStateEnum = z.enum(['corrected', 'uncorrected']);
export type CorrectionState = z.infer<typeof CorrectionStateEnum>;

export const GraphRelationshipSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string(),
  type: RelationshipTypeEnum,
  source_node_id: z.string(),
  target_node_id: z.string(),
  confidence: z.number().min(0).max(1),
  evidence_source_ids: z.array(z.string()).default([]),
  extraction_method: z.string(),
  valid_from: z.string().nullable().default(null),
  valid_to: z.string().nullable().default(null),
  recorded_from: z.string().nullable().default(null),
  recorded_to: z.string().nullable().default(null),
  status: NodeStatusEnum.default('current'),
  correction_state: CorrectionStateEnum.default('uncorrected'),
  properties: z.record(z.any()).default({}),
});

export type GraphRelationship = z.infer<typeof GraphRelationshipSchema>;
