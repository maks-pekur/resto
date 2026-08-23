/**
 * Telemetry + error-tracker bootstrap.
 *
 * MUST be the first import in `main.ts` — both Sentry and OTel patch
 * Node built-ins at module-load time; anything imported before this file
 * is missed. Sentry is initialised first so unhandled rejections during
 * the OTel bootstrap itself are captured.
 *
 * Per ADR-0008 every signal is tagged with `service.name`,
 * `service.version`, `deployment.environment`, and the `correlation_id`
 * baggage that flows in from the request middleware.
 */
import * as Sentry from '@sentry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

// G-04: init Sentry before NestJS so unhandled exceptions during boot are captured.
// No-op when SENTRY_DSN is absent — dev/test/CI boot unchanged.
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // Conservative: don't attach request bodies (may contain PII per T-075-03-03).
    sendDefaultPii: false,
  });
  log('[sentry] enabled');
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'resto-api';
const serviceVersion = process.env.npm_package_version ?? '0.0.0';
const environment = process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';

const disabled = process.env.OTEL_DISABLED === 'true';

if (disabled) {
  log('[telemetry] disabled (OTEL_DISABLED=true)');
} else {
  const sdk = new NodeSDK({
    // OTel JS 2.x replaced the `Resource` class with this factory; `new Resource()` is gone.
    resource: resourceFromAttributes({
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

  sdk.start();
  log(`[telemetry] enabled, exporting to ${endpoint}`);

  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
