import { execSync } from 'node:child_process';

/**
 * Probe whether the local Docker daemon is reachable. E2e specs gate
 * `describe(...)` on this so CI hosts without Docker do not turn a
 * legitimate environment limitation into a test failure.
 */
export const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
