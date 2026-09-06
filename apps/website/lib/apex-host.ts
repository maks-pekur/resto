import 'server-only';
import { websiteUrl } from './env';

const stripPort = (host: string): string => host.replace(/:\d+$/, '');

const apexHostname = (): string => new URL(websiteUrl()).hostname.toLowerCase();

export const isApexHost = (host: string): boolean => {
  const hostname = stripPort(host).toLowerCase();
  const apex = apexHostname();
  return hostname === apex || hostname === `www.${apex}`;
};
