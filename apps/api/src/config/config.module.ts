import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.schema';

export const ENV_TOKEN = Symbol('RESTO_ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV_TOKEN,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV_TOKEN],
})
export class ConfigModule {}
