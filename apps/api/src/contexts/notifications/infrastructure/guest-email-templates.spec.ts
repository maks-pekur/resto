import { describe, expect, it } from 'vitest';
import { renderGuestEmail, type GuestEmailVars } from './guest-email-templates';

const baseVars: GuestEmailVars = {
  orderNumber: 'ORD-001',
  itemsSummary: '1x Burger, 2x Fries',
  total: '25.00',
  currency: 'EUR',
};

describe('renderGuestEmail', () => {
  describe('order_confirmation', () => {
    it('returns html containing accent color and order number', () => {
      const result = renderGuestEmail(
        'order_confirmation',
        'en',
        { accentColor: '#16a34a', logoUrl: 'https://cdn.example.com/logo.png' },
        'Acme',
        baseVars,
      );
      expect(result.html).toContain('#16a34a');
      expect(result.html).toContain('ORD-001');
      expect(result.html).toContain('Acme');
      expect(result.subject).toContain('confirmed');
    });

    it('includes logo when logoUrl is valid https', () => {
      const result = renderGuestEmail(
        'order_confirmation',
        'en',
        { accentColor: '#16a34a', logoUrl: 'https://cdn.example.com/logo.png' },
        'Acme',
        baseVars,
      );
      expect(result.html).toContain('<img src="https://cdn.example.com/logo.png"');
    });

    it('renders a neutral default layout when brandTheme is null', () => {
      const result = renderGuestEmail('order_confirmation', 'en', null, 'Acme', baseVars);
      expect(result.html).toContain('#1a1a1a');
      expect(result.html).toContain('ORD-001');
    });

    it('renders Russian locale subject', () => {
      const result = renderGuestEmail('order_confirmation', 'ru', null, 'Acme', baseVars);
      expect(result.subject).toContain('принят');
    });
  });

  describe('order_refunded', () => {
    it('shows the refund amount', () => {
      const result = renderGuestEmail('order_refunded', 'en', { accentColor: '#dc2626' }, 'Acme', {
        ...baseVars,
        refundAmount: '12.50',
      });
      expect(result.text).toContain('12.50');
      expect(result.html).toContain('12.50');
    });
  });

  describe('sanitization', () => {
    it('replaces a malformed accentColor with the neutral default', () => {
      const result = renderGuestEmail(
        'order_confirmation',
        'en',
        { accentColor: '<script>alert(1)</script>', logoUrl: null },
        'Acme',
        baseVars,
      );
      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('#1a1a1a');
    });

    it('drops a non-https logoUrl', () => {
      const result = renderGuestEmail(
        'order_confirmation',
        'en',
        { accentColor: '#16a34a', logoUrl: 'http://evil.com/logo.png' },
        'Acme',
        baseVars,
      );
      expect(result.html).not.toContain('http://evil.com');
    });

    it('drops a javascript: logoUrl', () => {
      const result = renderGuestEmail(
        'order_confirmation',
        'en',
        { accentColor: '#16a34a', logoUrl: 'javascript:alert(1)' },
        'Acme',
        baseVars,
      );
      expect(result.html).not.toContain('javascript:');
    });

    it('escapes brand name html entities', () => {
      const result = renderGuestEmail('order_confirmation', 'en', null, '<Evil&Brand>', baseVars);
      expect(result.html).toContain('&lt;Evil&amp;Brand&gt;');
      expect(result.html).not.toContain('<Evil');
    });
  });

  describe('order_accepted and order_ready', () => {
    it('renders order_accepted with eta', () => {
      const result = renderGuestEmail('order_accepted', 'en', null, 'Acme', {
        ...baseVars,
        eta: '15 min',
      });
      expect(result.text).toContain('15 min');
    });

    it('renders order_ready', () => {
      const result = renderGuestEmail('order_ready', 'en', null, 'Acme', baseVars);
      expect(result.subject).toContain('ready');
      expect(result.text).toContain('ORD-001');
    });
  });
});
