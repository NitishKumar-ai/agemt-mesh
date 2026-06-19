import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Langfuse } from 'langfuse';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, Tracer, Span, SpanStatusCode } from '@opentelemetry/api';

export interface TelemetryConfig {
  serviceName?: string;
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
  langfuseBaseUrl?: string;
}

export class TelemetryService {
  private sdk?: NodeSDK;
  public langfuse?: Langfuse;
  public tracer: Tracer;

  constructor(config: TelemetryConfig = {}) {
    const serviceName = config.serviceName || 'conductor-agent-mesh';
    
    // Initialize Langfuse client for manual operations if needed
    if (config.langfusePublicKey && config.langfuseSecretKey) {
      this.langfuse = new Langfuse({
        publicKey: config.langfusePublicKey,
        secretKey: config.langfuseSecretKey,
        baseUrl: config.langfuseBaseUrl || 'https://cloud.langfuse.com',
      });
    }

    // Set up OTLP exporter to send traces to Langfuse
    // Note: Langfuse supports OTLP ingest over HTTP
    const traceExporter = new OTLPTraceExporter({
      url: (config.langfuseBaseUrl || 'https://cloud.langfuse.com') + '/api/public/otel/v1/traces',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.langfusePublicKey}:${config.langfuseSecretKey}`).toString('base64')}`
      }
    });

    this.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
      }),
      traceExporter,
      instrumentations: [getNodeAutoInstrumentations()]
    });

    try {
      if (config.langfusePublicKey) {
         this.sdk.start();
         console.log('Telemetry initialized.');
      }
    } catch (error) {
      console.warn('Error initializing telemetry', error);
    }

    this.tracer = trace.getTracer(serviceName);
  }

  public async shutdown() {
    try {
      await this.sdk?.shutdown();
      if (this.langfuse) {
        await this.langfuse.flushAsync();
      }
    } catch (error) {
      console.warn('Error shutting down telemetry', error);
    }
  }

  /**
   * Helper to trace an async function
   */
  public async traceAsync<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.tracer.startActiveSpan(name, { attributes }, async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          resolve(result);
        } catch (error: unknown) {
          const err = error as Error;
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message || 'Error',
          });
          span.recordException(err);
          reject(error);
        } finally {
          span.end();
        }
      });
    });
  }
}
