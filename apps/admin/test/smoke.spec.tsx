import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

describe('admin shell smoke', () => {
  it('renders a shadcn Button as a real DOM node', () => {
    render(<Button>Continue</Button>);
    const btn = screen.getByRole('button', { name: 'Continue' });
    expect(btn).toBeInTheDocument();
  });

  it('cn() merges Tailwind utilities with later wins', () => {
    expect(cn('p-2 p-4')).toBe('p-4');
    expect(cn('text-sm', 'font-medium')).toBe('text-sm font-medium');
  });
});
