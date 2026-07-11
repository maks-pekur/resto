export const printCredentialsBlock = (slug: string, email: string, password: string): void => {
  const bar = '─'.repeat(60);
  process.stdout.write(`\n${bar}\n`);
  process.stdout.write(`  BOOTSTRAP CREDENTIALS — copy now, this is shown ONCE\n`);
  process.stdout.write(`${bar}\n`);
  process.stdout.write(`  tenant slug : ${slug}\n`);
  process.stdout.write(`  email       : ${email}\n`);
  process.stdout.write(`  password    : ${password}\n`);
  process.stdout.write(`${bar}\n\n`);
};

export interface DemoAccountSummary {
  readonly role: string;
  readonly email: string;
  readonly password: string;
  readonly scope: string;
  readonly note?: string;
}

export const printDemoCredentialsBlock = (
  adminUrl: string,
  accounts: readonly DemoAccountSummary[],
): void => {
  const bar = '─'.repeat(72);
  process.stdout.write(`\n${bar}\n`);
  process.stdout.write(`  DEMO FIXTURE CREDENTIALS\n`);
  process.stdout.write(`${bar}\n`);
  process.stdout.write(`  admin URL   : ${adminUrl}\n\n`);
  for (const account of accounts) {
    process.stdout.write(`  role        : ${account.role}\n`);
    process.stdout.write(`  email       : ${account.email}\n`);
    process.stdout.write(`  password    : ${account.password}\n`);
    process.stdout.write(`  scope       : ${account.scope}\n`);
    if (account.note) process.stdout.write(`  note        : ${account.note}\n`);
    process.stdout.write(`\n`);
  }
  process.stdout.write(`${bar}\n\n`);
};
