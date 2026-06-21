import postgres from 'postgres';
import { provisionAppRole, provisionAuthRole } from '../index.js';

const main = async (): Promise<void> => {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const appPassword = process.env.APP_ROLE_PASSWORD;
  const authPassword = process.env.AUTH_ROLE_PASSWORD;

  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  if (!appPassword) throw new Error('APP_ROLE_PASSWORD is required');
  if (!authPassword) throw new Error('AUTH_ROLE_PASSWORD is required');

  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await provisionAppRole(admin, { appPassword });
    await provisionAuthRole(admin, { authPassword });
    process.stdout.write('Roles provisioned.\n');
  } finally {
    await admin.end({ timeout: 5 });
  }
};

main().catch((err: unknown) => {
  console.error('provision-roles-ci failed:', err);
  process.exit(1);
});
