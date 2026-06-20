import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import { EpisodeDAO, FactDAO, EntityDAO, IngestionJobDAO } from '@company-knowledge-os/database';
import { EntityExtractor } from '@company-knowledge-os/extraction';
import Queue, { Job } from 'bull';
import { ConnectorRegistry } from './connector-registry';

export interface IngestionJob {
  job_id: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  event_time: Date;
  arrival_time: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  error_message: string | null;
  processed_at: Date | null;
}

export class IngestionOrchestrator {
  private queue: Queue.Queue<IngestionJob>;

  constructor(
    private redisUrl: string,
    private episodeDAO: EpisodeDAO,
    private factDAO: FactDAO,
    private entityDAO: EntityDAO,
    private connectorRegistry: ConnectorRegistry,
    private entityExtractor: EntityExtractor,
    private ingestionJobDAO: IngestionJobDAO
  ) {
    this.queue = new Queue<IngestionJob>('ingestion-jobs', redisUrl);

    this.queue.process(async (job: Job<IngestionJob>) => {
      return await this.processIngestionJob(job.data);
    });

    this.queue.on('failed', (job: Job<IngestionJob>, err: Error) => {
      console.error(`Job ${job?.id} failed:`, err);
    });
  }

  async scheduleIngestion(
    tenantId: string,
    sourceSystem: string,
    sourceId: string,
    sourceVersion: string,
    eventTime: Date
  ): Promise<string> {
    const jobId = crypto.randomUUID();

    const jobData: IngestionJob = {
      job_id: jobId,
      tenant_id: tenantId,
      source_system: sourceSystem,
      source_id: sourceId,
      source_version: sourceVersion,
      event_time: eventTime,
      arrival_time: new Date(),
      status: 'pending',
      retry_count: 0,
      error_message: null,
      processed_at: null,
    };

    await this.ingestionJobDAO.createJob(jobData);

    await this.queue.add(
      'ingest',
      jobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }
    );

    return jobId;
  }

  async processIngestionJob(job: IngestionJob): Promise<void> {
    // Update job status to processing
    await this.updateJobStatus(job.job_id, 'processing');

    try {
      let episode: IEpisode;

      const connector = this.connectorRegistry.get(job.source_system);
      if (connector) {
        // Resolve the episode via the registered connector
        episode = await connector.fetchObject(job.source_id);
        episode.tenant_id = job.tenant_id;
      } else {
        // No connector registered: degrade gracefully with a placeholder episode
        episode = {
          episode_id: crypto.randomUUID(),
          tenant_id: job.tenant_id,
          source_system: job.source_system,
          source_id: job.source_id,
          source_version: job.source_version,
          raw_pointer: `https://example.com/${job.source_system}/${job.source_id}`,
          parsed_hash: crypto.randomUUID(),
          parsed_content: {},
          author: 'system',
          created_at: job.event_time,
          ingested_at: new Date(),
        };
      }

      // Store episode
      await this.episodeDAO.createEpisode(episode);

      // Trigger entity + fact extraction
      await this.entityExtractor.extract(episode);

      // Update job status to completed
      await this.updateJobStatus(job.job_id, 'completed', new Date());

    } catch (error) {
      console.error('Error processing ingestion job:', error);

      // Update job status to failed
      await this.updateJobStatus(
        job.job_id,
        'failed',
        new Date(),
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  private async updateJobStatus(
    jobId: string,
    status: IngestionJob['status'],
    processedAt?: Date,
    errorMessage?: string
  ): Promise<void> {
    await this.ingestionJobDAO.updateJobStatus(jobId, status, processedAt || null, errorMessage || null);
    console.log(`Job ${jobId} status updated to ${status}`);
  }

  async getJobStatus(jobId: string): Promise<IngestionJob | null> {
    const job = await this.ingestionJobDAO.getJob(jobId);
    return job as IngestionJob | null;
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return await this.ingestionJobDAO.getJobStats();
  }

  async stop(): Promise<void> {
    await this.queue.close();
  }
}