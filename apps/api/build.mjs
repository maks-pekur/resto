import { build } from 'esbuild';

/**
 * Production bundle for `apps/api`.
 *
 * NestJS lazily `require`s many transport adapters (Express, Microservices,
 * WebSockets, gRPC, Kafka, MQTT, AMQP, Redis) at runtime — even when the
 * app does not use them. esbuild's bundler tries to resolve every import
 * statically and would fail on the optional ones; we mark the unused
 * adapters `external` so the bundle skips them. Anything in this list
 * MUST stay out of the runtime image's `node_modules` (otherwise it
 * implicitly enables the corresponding NestJS feature).
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
});
