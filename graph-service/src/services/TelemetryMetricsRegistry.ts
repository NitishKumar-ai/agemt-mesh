export interface IngestionMetrics {
  sync_lag_seconds: number;
  connector_success_rate: number;
  connector_error_rate: number;
  documents_discovered: number;
  documents_ingested: number;
  documents_failed: number;
  parse_success_rate: number;
  parse_failure_reason: Record<string, number>;
  chunk_count: number;
  embedding_success_rate: number;
  duplicate_document_rate: number;
  permission_mapping_success_rate: number;
}

export interface GraphQualityMetrics {
  entities_extracted_count: number;
  relations_extracted_count: number;
  entity_resolution_confidence_avg: number;
  duplicate_entity_rate: number;
  orphan_entity_rate: number;
  relation_confidence_avg: number;
  fact_conflict_rate: number;
  supersession_detection_rate: number;
  stale_fact_rate: number;
  correction_rate: number;
  correction_acceptance_rate: number;
}

export interface RetrievalMetrics {
  recall_at_5: number;
  recall_at_10: number;
  mrr: number;
  citation_fidelity: number;
  answer_groundedness: number;
  abstention_rate: number;
  false_abstention_rate: number;
  reranker_win_rate: number;
  query_latency_p50: number;
  query_latency_p95: number;
  query_latency_p99: number;
}

export interface WorkflowMetrics {
  workflow_run_count: number;
  workflow_success_rate: number;
  workflow_generation_latency: number;
  user_open_rate: number;
  user_copy_rate: number;
  user_correction_rate: number;
  user_share_rate: number;
}

export interface CalibrationMetricRecord {
  answer_id: string;
  raw_confidence: number;
  calibrated_confidence: number;
  evidence_count: number;
  citation_fidelity: number;
  graph_support_score: number;
  retrieval_score: number;
  human_feedback: 'accepted' | 'rejected' | 'pending';
}

export class TelemetryMetricsRegistry {
  private ingestion: IngestionMetrics = {
    sync_lag_seconds: 4.5,
    connector_success_rate: 0.98,
    connector_error_rate: 0.02,
    documents_discovered: 1250,
    documents_ingested: 1240,
    documents_failed: 10,
    parse_success_rate: 0.99,
    parse_failure_reason: { 'TimeoutError': 7, 'UnsupportedFormat': 3 },
    chunk_count: 8400,
    embedding_success_rate: 0.998,
    duplicate_document_rate: 0.12,
    permission_mapping_success_rate: 1.0,
  };

  private graphQuality: GraphQualityMetrics = {
    entities_extracted_count: 320,
    relations_extracted_count: 580,
    entity_resolution_confidence_avg: 0.89,
    duplicate_entity_rate: 0.05,
    orphan_entity_rate: 0.02,
    relation_confidence_avg: 0.86,
    fact_conflict_rate: 0.04,
    supersession_detection_rate: 0.15,
    stale_fact_rate: 0.08,
    correction_rate: 0.015,
    correction_acceptance_rate: 0.92,
  };

  private retrieval: RetrievalMetrics = {
    recall_at_5: 0.88,
    recall_at_10: 0.93,
    mrr: 0.79,
    citation_fidelity: 0.92,
    answer_groundedness: 0.94,
    abstention_rate: 0.05,
    false_abstention_rate: 0.01,
    reranker_win_rate: 0.68,
    query_latency_p50: 120,
    query_latency_p95: 450,
    query_latency_p99: 980,
  };

  private workflow: WorkflowMetrics = {
    workflow_run_count: 145,
    workflow_success_rate: 0.97,
    workflow_generation_latency: 2400,
    user_open_rate: 0.84,
    user_copy_rate: 0.35,
    user_correction_rate: 0.02,
    user_share_rate: 0.18,
  };

  private calibrations: CalibrationMetricRecord[] = [
    {
      answer_id: 'ans_123',
      raw_confidence: 0.82,
      calibrated_confidence: 0.74,
      evidence_count: 8,
      citation_fidelity: 0.91,
      graph_support_score: 0.77,
      retrieval_score: 0.86,
      human_feedback: 'accepted',
    },
    {
      answer_id: 'ans_124',
      raw_confidence: 0.95,
      calibrated_confidence: 0.93,
      evidence_count: 12,
      citation_fidelity: 0.98,
      graph_support_score: 0.95,
      retrieval_score: 0.94,
      human_feedback: 'accepted',
    },
    {
      answer_id: 'ans_125',
      raw_confidence: 0.65,
      calibrated_confidence: 0.48,
      evidence_count: 2,
      citation_fidelity: 0.75,
      graph_support_score: 0.40,
      retrieval_score: 0.60,
      human_feedback: 'pending',
    }
  ];

  recordIngestion(update: Partial<IngestionMetrics>) {
    this.ingestion = { ...this.ingestion, ...update };
  }

  recordGraphQuality(update: Partial<GraphQualityMetrics>) {
    this.graphQuality = { ...this.graphQuality, ...update };
  }

  recordRetrieval(update: Partial<RetrievalMetrics>) {
    this.retrieval = { ...this.retrieval, ...update };
  }

  recordWorkflow(update: Partial<WorkflowMetrics>) {
    this.workflow = { ...this.workflow, ...update };
  }

  recordCalibration(record: CalibrationMetricRecord) {
    this.calibrations.push(record);
  }

  getDashboardMetrics() {
    return {
      ingestion: this.ingestion,
      graphQuality: this.graphQuality,
      retrieval: this.retrieval,
      workflow: this.workflow,
      calibrations: this.calibrations,
    };
  }
}

export const telemetryMetricsRegistry = new TelemetryMetricsRegistry();
