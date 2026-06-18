export * from './TelemetryService.js';
// Re-export trace and span types from OpenTelemetry api
export { trace, context, Span, SpanStatusCode, Tracer } from '@opentelemetry/api';
