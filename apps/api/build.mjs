import { build } from 'esbuild';

/**
 * Production bundle for `apps/api`.
 *
 * Bundling strategy:
 *   - Workspace packages (`@resto/*`) are bundled into `dist/main.cjs`.
 *     They are TypeScript-only with `main: ./src/index.ts`, so Node
 *     cannot require them at runtime — they must live inline.
 *   - Every other bare import (npm packages, scoped or unscoped) is
 *     marked external. The Dockerfile's runtime stage ships
 *     `node_modules/`, so Node resolves them at startup. This keeps
 *     the bundle small and avoids esbuild "Could not resolve <pkg>"
 *     errors when the Docker deps stage has not populated every
 *     transitive dep of every workspace package.
 *   - NESTJS_OPTIONAL_PEERS stays in the explicit external list to
 *     reinforce intent: NestJS lazily `require`s many transport adapters
 *     (microservices, WebSockets, gRPC, Kafka, MQTT, AMQP, Mongo, etc.)
 *     at runtime — even when the app does not use them. Marking them
 *     external means the bundle skips them, AND the runtime image MUST
 *     NOT install them (otherwise NestJS auto-detects and implicitly
 *     enables the corresponding feature).
 */
const NESTJS_OPTIONAL_PEERS = [
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  '@nestjs/platform-express',
  '@nestjs/platform-socket.io',
  'class-transformer',
  'class-validator',
  'cache-manager',
  '@grpc/grpc-js',
  '@grpc/proto-loader',
  'kafkajs',
  'mqtt',
  'amqp-connection-manager',
  'amqplib',
  'redis',
  'ioredis',
  // NOTE: `nats` is intentionally NOT in this list. It is a direct runtime
  // dep of packages/events (not just a NestJS optional peer) and is NOT
  // hoisted to node_modules/ by pnpm in the Docker image — bundling it inline
  // is simpler than wiring a Dockerfile symlink. NestJS NATS auto-detection
  // fires via @nestjs/microservices (which IS external above), not the raw
  // `nats` package, so inlining `nats` does not enable the microservices transport.
  'mongoose',
  '@apollo/subgraph',
  '@apollo/gateway',
  '@apollo/server',
  '@fastify/view',
  '@fastify/static',
];

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/main.cjs',
  // G-01: inline *.sql files as string literals so import.meta.dirname
  // path math never runs at runtime inside the CJS bundle.
  loader: { '.sql': 'text' },
  external: NESTJS_OPTIONAL_PEERS,
  logLevel: 'info',
  sourcemap: true,
  plugins: [
    {
      // Externalize every npm package, but let esbuild bundle workspace
      // packages (@resto/*) because they ship as TypeScript source.
      // G-01: `nats` is also bundled inline because pnpm does not hoist it
      // to a top-level node_modules/ symlink in the Docker image — it is only
      // available via .pnpm/ virtual store which Node's CJS resolver cannot
      // traverse. Inlining avoids a Dockerfile symlink workaround.
      name: 'externalize-non-workspace',
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@resto/')) return null;
          // G-01: nats + its transitive deps (nkeys.js → tweetnacl) are bundled
          // inline because pnpm does not hoist them to top-level node_modules/ in
          // the Docker image. All three are pure-JS with no native addons.
          if (args.path === 'nats' || args.path === 'nkeys.js' || args.path === 'tweetnacl')
            return null;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
