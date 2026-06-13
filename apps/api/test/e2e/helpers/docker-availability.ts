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
    const flag = process.env.RESTO_REQUIRE_DOCKER;
    if (flag === '1' || flag === 'true') {
      throw new Error(
        'RESTO_REQUIRE_DOCKER is set but Docker is not available — refusing to silently skip the e2e isolation suite. Start Docker or unset RESTO_REQUIRE_DOCKER.',
      );
    }
    return false;
  }
};
