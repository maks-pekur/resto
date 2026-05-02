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
