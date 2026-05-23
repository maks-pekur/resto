import { describe, expect, it } from 'vitest';
import {
  assertNodeEnvAllowed,
  assertConfirmationProvided,
  assertHostAllowed,
  ResetGuardError,
  CONFIRMATION_VALUE,
} from '../../src/cli/reset-guards';

describe('cli/reset-guards', () => {
  describe('assertNodeEnvAllowed', () => {
    it('accepts development', () => {
      expect(() => {
        assertNodeEnvAllowed('development');
      }).not.toThrow();
    });
    it('accepts test', () => {
      expect(() => {
        assertNodeEnvAllowed('test');
      }).not.toThrow();
    });
    it('rejects production', () => {
      expect(() => {
        assertNodeEnvAllowed('production');
      }).toThrow(ResetGuardError);
      expect(() => {
        assertNodeEnvAllowed('production');
      }).toThrow(/allowlist/);
    });
    it('rejects unset', () => {
      expect(() => {
        assertNodeEnvAllowed(undefined);
      }).toThrow(/allowlist/);
    });
    it('rejects typo "prod"', () => {
      expect(() => {
        assertNodeEnvAllowed('prod');
      }).toThrow(/allowlist/);
    });
  });

  describe('assertConfirmationProvided', () => {
    it('accepts the literal sentence', () => {
      expect(() => {
        assertConfirmationProvided(CONFIRMATION_VALUE);
      }).not.toThrow();
    });
    it('rejects empty / unset', () => {
      expect(() => {
        assertConfirmationProvided(undefined);
      }).toThrow(/RESTO_CONFIRM_RESET/);
      expect(() => {
        assertConfirmationProvided('');
      }).toThrow(/RESTO_CONFIRM_RESET/);
    });
    it('rejects "1" (a boolean-style toggle would be too easy)', () => {
      expect(() => {
        assertConfirmationProvided('1');
      }).toThrow(/RESTO_CONFIRM_RESET/);
    });
    it('rejects close-but-wrong value', () => {
      expect(() => {
        assertConfirmationProvided('yes-wipe-my-db');
      }).toThrow(/RESTO_CONFIRM_RESET/);
    });
  });

  describe('assertHostAllowed', () => {
    it('accepts localhost', () => {
      expect(() => {
        assertHostAllowed('postgres://x@localhost:5432/y');
      }).not.toThrow();
    });
    it('accepts 127.0.0.1', () => {
      expect(() => {
        assertHostAllowed('postgres://x@127.0.0.1:5432/y');
      }).not.toThrow();
    });
    it('accepts the docker-compose hostname "postgres"', () => {
      expect(() => {
        assertHostAllowed('postgres://x@postgres:5432/y');
      }).not.toThrow();
    });
    it('rejects an external hostname', () => {
      expect(() => {
        assertHostAllowed('postgres://x@db.example.com:5432/y');
      }).toThrow(/allowlist/);
    });
    it('rejects an invalid URL', () => {
      expect(() => {
        assertHostAllowed('not a url');
      }).toThrow(/valid URL/);
    });
    it('rejects undefined URL', () => {
      expect(() => {
        assertHostAllowed(undefined);
      }).toThrow(/DATABASE_ADMIN_URL is required/);
    });
    it('rejects empty string URL (env var exported as empty)', () => {
      expect(() => {
        assertHostAllowed('');
      }).toThrow(/DATABASE_ADMIN_URL is required/);
    });
    it('accepts uppercase LOCALHOST (case-insensitive)', () => {
      expect(() => {
        assertHostAllowed('postgres://x@LOCALHOST:5432/y');
      }).not.toThrow();
    });
  });

  describe('ResetGuardError', () => {
    it('is an instance of Error with name "ResetGuardError"', () => {
      try {
        assertNodeEnvAllowed('production');
        expect.fail('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ResetGuardError);
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).name).toBe('ResetGuardError');
      }
    });
  });
});
