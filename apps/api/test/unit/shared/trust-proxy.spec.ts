import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from '../../../src/config/trust-proxy';

describe('parseTrustProxy', () => {
  it('returns false for unset/empty/explicit false', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('returns true only for the literal "true"', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('parses a positive integer as a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('3')).toBe(3);
  });

  it('returns a single CIDR string unchanged', () => {
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('returns an array for a comma-separated CIDR list', () => {
    expect(parseTrustProxy('10.0.0.0/8,172.16.0.0/12')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseTrustProxy('  10.0.0.0/8 , , 192.168.0.0/16 ')).toEqual([
      '10.0.0.0/8',
      '192.168.0.0/16',
    ]);
  });
});
