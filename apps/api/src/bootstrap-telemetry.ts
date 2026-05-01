/**
 * OpenTelemetry SDK bootstrap.
 *
 * MUST be the first import in `main.ts` — instrumentation patches
 * Node built-ins (http, fetch, fs) at module-load time, and any module
 * imported before this one is missed. The OTLP exporter ships traces
 * (and later metrics) to the collector configured by
 * `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4318` — the
 * dev-stack Jaeger).
 *
 * Per ADR-0008 every signal is tagged with `service.name`,
 * `service.version`, `deployment.environment`, and the `correlation_id`
 * baggage that flows in from the request middleware.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'resto-api';
const serviceVersion = process.env.npm_package_version ?? '0.0.0';
const environment = process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

const sdk = new NodeSDK({
  resource: new Resource({
    'service.name': serviceName,
    'service.version': serviceVersion,
    'deployment.environment': environment,
  }),
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Filesystem spans are noise; turn them off by default. Re-enable
      // per-environment if a specific investigation needs them.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

if (process.env.OTEL_DISABLED !== 'true') {
  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
