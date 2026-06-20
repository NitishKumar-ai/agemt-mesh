import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import { EpisodeDAO, FactDAO, EntityDAO } from '@company-knowledge-os/database';
import { Queue, Worker, Job } from 'bull';

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
  private queue: Queue<IngestionJob>;
  private worker: Worker<IngestionJob>;

  constructor(
    private redisUrl: string,
    private episodeDAO: EpisodeDAO,
    private factDAO: FactDAO,
    private entityDAO: EntityDAO
  ) {
    this.queue = new Queue<IngestionJob>('ingestion-jobs', { redis: { url: redisUrl } });

    this.worker = new Worker<IngestionJob>(
      this.queue,
      async (job: Job<IngestionJob>) => {
        return await this.processIngestionJob(job.data);
      },
      { connection: { url: redisUrl } }
    );

    this.worker.on('failed', (job, err) => {
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

    await this.queue.add(
      'ingest',
      {
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
      },
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
      // TODO: Get connector instance from connector registry
      // const connector = this.connectorRegistry.getConnector(job.source_system);
      // const episodes = await connector.fetchChanges(job.event_time);

      // Placeholder: Create episode directly
      const episode: IEpisode = {
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

      // Store episode
      await this.episodeDAO.createEpisode(episode);

      // TODO: Trigger entity extraction
      // await this.entityExtractor.extract(episode);

      // TODO: Trigger fact extraction
      // await this.factExtractor.extract(episode);

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
    // TODO: Update ingestion_jobs table
    console.log(`Job ${jobId} status updated to ${status}`);
  }

  async getJobStatus(jobId: string): Promise<IngestionJob | null> {
    // TODO: Query ingestion_jobs table
    return null;
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    // TODO: Query ingestion_jobs table
    return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
  }

  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}