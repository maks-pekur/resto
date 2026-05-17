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
  'nats',
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
  external: NESTJS_OPTIONAL_PEERS,
  logLevel: 'info',
  sourcemap: true,
  plugins: [
    {
      // Externalize every npm package, but let esbuild bundle workspace
      // packages (@resto/*) because they ship as TypeScript source.
      name: 'externalize-non-workspace',
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@resto/')) return null;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
