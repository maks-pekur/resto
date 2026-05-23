import { describe, expect, it } from 'vitest';
import { validateRolePassword } from '../../src/internal/password';

describe('validateRolePassword', () => {
  describe('accepts', () => {
    it('a 16-char alphanumeric password', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890');
      }).not.toThrow();
    });
    it('a 128-char password (max length)', () => {
      expect(() => {
        validateRolePassword('test', 'a'.repeat(128));
      }).not.toThrow();
    });
    it('a mix of allowed punctuation', () => {
      expect(() => {
        validateRolePassword('test', 'A1b2!@#$%^&*()_+-=ab');
      }).not.toThrow();
    });
  });

  describe('rejects by length', () => {
    it('empty password', () => {
      expect(() => {
        validateRolePassword('test', '');
      }).toThrow(/length=0/);
    });
    it('15-char password (one short)', () => {
      expect(() => {
        validateRolePassword('test', 'a'.repeat(15));
      }).toThrow(/length=15/);
    });
    it('129-char password (one long)', () => {
      expect(() => {
        validateRolePassword('test', 'a'.repeat(129));
      }).toThrow(/length=129/);
    });
  });

  describe('rejects SQL-injection vectors', () => {
    it('newline', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890\nALTER');
      }).toThrow(/whitelist/i);
    });
    it('carriage return', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890\rALTER');
      }).toThrow(/whitelist/i);
    });
    it('null byte', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890\0ALTER');
      }).toThrow(/whitelist/i);
    });
    it("single quote (')", () => {
      expect(() => {
        validateRolePassword('test', "abcdef1234567890'OR1=1");
      }).toThrow(/whitelist/i);
    });
    it('backslash', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890\\ALTER');
      }).toThrow(/whitelist/i);
    });
    it('SQL line comment (--)', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890--ALTER');
      }).toThrow(/whitelist/i);
    });
    it('SQL block comment (/*)', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890/*ALTER*/');
      }).toThrow(/whitelist/i);
    });
    it('semicolon', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890;ALTER');
      }).toThrow(/whitelist/i);
    });
    it('space', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890 ALTER');
      }).toThrow(/whitelist/i);
    });
    it('tab', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890\tALTER');
      }).toThrow(/whitelist/i);
    });
    it('non-ASCII', () => {
      expect(() => {
        validateRolePassword('test', 'abcdef1234567890é');
      }).toThrow(/whitelist/i);
    });
  });

  describe('security — error never leaks the raw password', () => {
    it("doesn't include the raw value when rejecting whitespace", () => {
      const raw = "abcdef1234567890'; DROP TABLE users; --";
      let captured: string | undefined;
      try {
        validateRolePassword('test', raw);
      } catch (err) {
        captured = (err as Error).message;
      }
      expect(captured).toBeDefined();
      expect(captured).not.toContain(raw);
      expect(captured).not.toContain('DROP TABLE');
      expect(captured).toContain('sanitised');
    });
  });

  describe('error message includes purpose context', () => {
    it('names the purpose passed in', () => {
      expect(() => {
        validateRolePassword('provisionAppRole', 'short');
      }).toThrow(/provisionAppRole/);
    });
  });
});
