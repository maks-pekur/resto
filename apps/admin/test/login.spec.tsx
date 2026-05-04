import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { replaceMock, signInMock, orgListMock, setActiveMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signInMock: vi.fn(),
  orgListMock: vi.fn(),
  setActiveMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: signInMock },
    organization: { list: orgListMock, setActive: setActiveMock },
  },
}));

import LoginPage from '@/app/login/page';

describe('LoginPage', () => {
  it('signs in, auto-activates the only org, and redirects', async () => {
    signInMock.mockResolvedValueOnce({ error: null });
    orgListMock.mockResolvedValueOnce({ data: [{ id: 'org-uuid' }] });
    setActiveMock.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'ops@demo.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await vi.waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
    expect(signInMock).toHaveBeenCalledWith({
      email: 'ops@demo.test',
      password: 'correct-horse-battery-staple',
    });
    expect(setActiveMock).toHaveBeenCalledWith({ organizationId: 'org-uuid' });
  });

  it('surfaces the BA error message and stays on the page', async () => {
    replaceMock.mockClear();
    signInMock.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'ops@demo.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
