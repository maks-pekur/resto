import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('Cannot connect to the Docker daemon');
  }),
}));

const { isDockerAvailable } = await import('../setup');

describe('isDockerAvailable RESTO_REQUIRE_DOCKER guard', () => {
  const original = process.env.RESTO_REQUIRE_DOCKER;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RESTO_REQUIRE_DOCKER;
    } else {
      process.env.RESTO_REQUIRE_DOCKER = original;
    }
  });

  it('returns false when the flag is unset and Docker is unavailable', () => {
    delete process.env.RESTO_REQUIRE_DOCKER;
    expect(isDockerAvailable()).toBe(false);
  });

  it('throws when RESTO_REQUIRE_DOCKER=1 and Docker is unavailable', () => {
    process.env.RESTO_REQUIRE_DOCKER = '1';
    expect(() => isDockerAvailable()).toThrow(/RESTO_REQUIRE_DOCKER/);
  });

  it('throws when RESTO_REQUIRE_DOCKER=true and Docker is unavailable', () => {
    process.env.RESTO_REQUIRE_DOCKER = 'true';
    expect(() => isDockerAvailable()).toThrow(/refusing to silently skip/);
  });
});
