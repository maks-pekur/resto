import { describe, expect, it } from 'vitest';
import {
  MissingEnvError,
  parseFlags,
  requireFlag,
  resolveRuntimeOptions,
} from '../seed/lib/options';

describe('parseFlags', () => {
  it('parses --flag value pairs', () => {
    const result = parseFlags(['--slug', 'cafe-roma', '--name', 'Cafe Roma']);
    expect(result.named.get('slug')).toBe('cafe-roma');
    expect(result.named.get('name')).toBe('Cafe Roma');
  });

  it('parses --flag=value form', () => {
    const result = parseFlags(['--slug=cafe-roma', '--name=Cafe Roma']);
    expect(result.named.get('slug')).toBe('cafe-roma');
    expect(result.named.get('name')).toBe('Cafe Roma');
  });

  it('marks dangling flags as boolean true', () => {
    const result = parseFlags(['--dry-run', '--name', 'Acme']);
    expect(result.named.get('dry-run')).toBe('true');
    expect(result.named.get('name')).toBe('Acme');
  });

  it('separates positional args', () => {
    const result = parseFlags(['provision-tenant', '--slug', 'a', 'extra']);
    expect(result.positional).toEqual(['provision-tenant', 'extra']);
  });
});

describe('requireFlag', () => {
  it('returns the flag value when present', () => {
    const flags = parseFlags(['--slug', 'a']);
    expect(requireFlag(flags, 'slug')).toBe('a');
  });

  it('throws when the flag is missing', () => {
    const flags = parseFlags([]);
    expect(() => requireFlag(flags, 'slug')).toThrow(/Missing required flag/);
  });

  it('throws when the flag is a dangling boolean', () => {
    const flags = parseFlags(['--slug']);
    expect(() => requireFlag(flags, 'slug')).toThrow();
  });
});

describe('resolveRuntimeOptions', () => {
  const baseEnv = {
    INTERNAL_API_TOKEN: 'token-1234567890123456',
  } satisfies NodeJS.ProcessEnv;

  it('reads required env and applies sensible defaults', () => {
    const opts = resolveRuntimeOptions([], baseEnv);
    expect(opts.apiUrl).toBe('http://localhost:3000');
    expect(opts.internalToken).toBe(baseEnv.INTERNAL_API_TOKEN);
    expect(opts.dryRun).toBe(false);
  });

  it('honours RESTO_API_URL override', () => {
    const opts = resolveRuntimeOptions([], { ...baseEnv, RESTO_API_URL: 'https://api.example' });
    expect(opts.apiUrl).toBe('https://api.example');
  });

  it('detects --dry-run', () => {
    const opts = resolveRuntimeOptions(['--dry-run'], baseEnv);
    expect(opts.dryRun).toBe(true);
  });

  it('throws MissingEnvError when INTERNAL_API_TOKEN is unset', () => {
    expect(() => resolveRuntimeOptions([], {})).toThrow(MissingEnvError);
  });
});
