import { z } from 'zod';
import { NestFactory } from '@nestjs/core';
import { TenantSlug } from '@resto/domain';
import { BootstrapModule } from '@resto/api/contexts/identity/bootstrap.module';
import { BootstrapOwnerService } from '@resto/api/contexts/identity/application/bootstrap-owner.service';
import { log } from '../lib/logger';
import { parseFlags, requireFlag, type RuntimeOptions } from '../lib/options';
import {
  generateOwnerPassword,
  readPasswordFromStdin,
  assertPasswordFlagAllowed,
} from '../lib/password';
import { printCredentialsBlock } from '../lib/credentials-block';

const Input = z.object({
  tenant: TenantSlug,
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(1).max(120).default('Owner'),
});

export const runBootstrapOwner = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  const flags = parseFlags(argv);
  const parsed = Input.parse({
    tenant: requireFlag(flags, 'tenant'),
    email: requireFlag(flags, 'email'),
    ...(flags.named.has('name') ? { name: flags.named.get('name') } : {}),
  });

  const passwordFromFlag = flags.named.get('owner-password');
  const passwordStdin = flags.named.get('password-stdin') === 'true';
  let password: string;
  let generated = false;

  if (passwordFromFlag) {
    assertPasswordFlagAllowed(process.env);
    password = passwordFromFlag;
  } else if (passwordStdin) {
    password = await readPasswordFromStdin();
  } else {
    password = generateOwnerPassword();
    generated = true;
  }

  if (options.dryRun) {
    log('bootstrap-owner.plan', { tenant: parsed.tenant, email: parsed.email });
    return;
  }

  const app = await NestFactory.createApplicationContext(BootstrapModule, {
    logger: ['warn', 'error'],
  });
  try {
    const svc = app.get(BootstrapOwnerService);
    const result = await svc.execute({
      tenantSlug: parsed.tenant,
      email: parsed.email,
      password,
      name: parsed.name,
    });

    log('bootstrap-owner.done', {
      tenantId: result.tenantId,
      userId: result.userId,
      email: result.email,
    });

    if (generated) {
      printCredentialsBlock(parsed.tenant, parsed.email, password);
    }
  } finally {
    await app.close();
  }
};
