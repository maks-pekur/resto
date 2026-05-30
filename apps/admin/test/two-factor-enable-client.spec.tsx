import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const enableTwoFactorMock = vi.fn();
const verifyTwoFactorMock = vi.fn();
const disableTwoFactorMock = vi.fn();

vi.mock('@/app/dashboard/(workspace)/settings/two-factor-actions', () => ({
  enableTwoFactorAction: enableTwoFactorMock,
  verifyTwoFactorAction: verifyTwoFactorMock,
  disableTwoFactorAction: disableTwoFactorMock,
}));

const writeTextMock = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: writeTextMock },
});

// jsdom does not implement window.location.reload(); attach a no-op listener on
// the `beforeunload` event to short-circuit the navigation. The component only
// calls `reload()` after a successful verify, and the assertion already runs
// before the call site, so the noisy stderr is harmless — but we still want a
// quiet log. Wrap reload in a try/catch on the component side via a guard:
// since the linter forbids spreading a class instance and forbids redefining
// the location prototype, we silence the noise by overriding console.error to
// drop only the specific jsdom navigation warning.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  if (
    args.length > 0 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    args[0] instanceof Error &&
    args[0].message.includes('Not implemented: navigation')
  ) {
    return;
  }
  originalConsoleError(...args);
};

const { TwoFactorSection } =
  await import('../app/dashboard/(workspace)/settings/two-factor-enable-client');

const TEN_CODES = [
  'aaaa-aaaa',
  'bbbb-bbbb',
  'cccc-cccc',
  'dddd-dddd',
  'eeee-eeee',
  'ffff-ffff',
  'gggg-gggg',
  'hhhh-hhhh',
  'iiii-iiii',
  'jjjj-jjjj',
];

const TOTP_URI = 'otpauth://totp/RestOS:o@x?secret=ABCDEFGHIJKLMNOP&issuer=RestOS';

describe('TwoFactorSection — disabled state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Enable 2FA" CTA when twoFactorEnabled=false', () => {
    render(<TwoFactorSection twoFactorEnabled={false} />);
    expect(screen.getByRole('heading', { name: /Two-factor authentication/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enable 2FA/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Disable 2FA/u })).not.toBeInTheDocument();
  });

  it('opens the password confirmation dialog when "Enable 2FA" is clicked', async () => {
    const user = userEvent.setup();
    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    expect(await screen.findByLabelText(/Current password/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/u })).toBeInTheDocument();
  });

  it('calls enableTwoFactorAction with the entered password and shows the codes dialog on success', async () => {
    const user = userEvent.setup();
    enableTwoFactorMock.mockResolvedValueOnce({
      ok: true,
      totpURI: TOTP_URI,
      backupCodes: TEN_CODES,
    });

    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 's3cret-pwd');
    await user.click(screen.getByRole('button', { name: /Continue/u }));

    await waitFor(() => {
      expect(enableTwoFactorMock).toHaveBeenCalledWith('s3cret-pwd');
    });

    // The codes dialog shows all 10 codes, the QR/URI surface, the saved checkbox,
    // the TOTP input, and a disabled Confirm button.
    for (const code of TEN_CODES) {
      expect(await screen.findByText(code)).toBeInTheDocument();
    }
    expect(screen.getByText(TOTP_URI)).toBeInTheDocument();
    expect(screen.getByLabelText(/I have saved these recovery codes/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeDisabled();
  });

  it('shows a friendly error and keeps the password dialog open on invalid_password', async () => {
    const user = userEvent.setup();
    enableTwoFactorMock.mockResolvedValueOnce({ ok: false, error: 'invalid_password' });

    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 'wrong');
    await user.click(screen.getByRole('button', { name: /Continue/u }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/password/i);
    // Dialog still open — password input still visible.
    expect(screen.getByLabelText(/Current password/u)).toBeInTheDocument();
  });
});

describe('TwoFactorSection — saved-confirmation gate (D-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableTwoFactorMock.mockResolvedValue({
      ok: true,
      totpURI: TOTP_URI,
      backupCodes: TEN_CODES,
    });
  });

  const openCodesDialog = async (): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 's3cret-pwd');
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    await screen.findByText(TEN_CODES[0] ?? '');
    return user;
  };

  it('Confirm stays disabled when neither the checkbox nor a 6-digit code are present', async () => {
    await openCodesDialog();
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeDisabled();
  });

  it('Confirm stays disabled when only the checkbox is checked (no TOTP)', async () => {
    const user = await openCodesDialog();
    await user.click(screen.getByLabelText(/I have saved these recovery codes/u));
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeDisabled();
  });

  it('Confirm stays disabled when only the TOTP code is present (no checkbox)', async () => {
    const user = await openCodesDialog();
    await user.type(screen.getByLabelText(/6-digit code/u), '123456');
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeDisabled();
  });

  it('Confirm stays disabled when TOTP is not exactly 6 digits even with checkbox checked', async () => {
    const user = await openCodesDialog();
    await user.click(screen.getByLabelText(/I have saved these recovery codes/u));
    await user.type(screen.getByLabelText(/6-digit code/u), '12345');
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeDisabled();
  });

  it('Confirm becomes enabled when both checkbox is checked AND TOTP is exactly 6 digits', async () => {
    const user = await openCodesDialog();
    await user.click(screen.getByLabelText(/I have saved these recovery codes/u));
    await user.type(screen.getByLabelText(/6-digit code/u), '123456');
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeEnabled();
  });

  it('Copy to clipboard joins all 10 codes with a newline separator', async () => {
    // user-event v14 `setup()` replaces navigator.clipboard with its own stub
    // regardless of `writeToClipboard`. Spy on the post-setup clipboard so we
    // observe whatever writeText the component actually calls.
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 's3cret-pwd');
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    await screen.findByText(TEN_CODES[0] ?? '');
    await user.click(screen.getByRole('button', { name: /Copy all/u }));
    expect(writeSpy).toHaveBeenCalledWith(TEN_CODES.join('\n'));
  });
});

describe('TwoFactorSection — verify flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableTwoFactorMock.mockResolvedValue({
      ok: true,
      totpURI: TOTP_URI,
      backupCodes: TEN_CODES,
    });
  });

  const reachConfirm = async (): Promise<ReturnType<typeof userEvent.setup>> => {
    const user = userEvent.setup();
    render(<TwoFactorSection twoFactorEnabled={false} />);
    await user.click(screen.getByRole('button', { name: /Enable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 's3cret-pwd');
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    await screen.findByText(TEN_CODES[0] ?? '');
    await user.click(screen.getByLabelText(/I have saved these recovery codes/u));
    await user.type(screen.getByLabelText(/6-digit code/u), '123456');
    return user;
  };

  it('calls verifyTwoFactorAction with the 6-digit code on Confirm', async () => {
    verifyTwoFactorMock.mockResolvedValueOnce({ ok: true });
    const user = await reachConfirm();
    await user.click(screen.getByRole('button', { name: /Confirm/u }));
    await waitFor(() => {
      expect(verifyTwoFactorMock).toHaveBeenCalledWith('123456');
    });
  });

  it('surfaces "Invalid code" alert and keeps Confirm enabled on invalid_code', async () => {
    verifyTwoFactorMock.mockResolvedValueOnce({ ok: false, error: 'invalid_code' });
    const user = await reachConfirm();
    await user.click(screen.getByRole('button', { name: /Confirm/u }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
    // User can correct the code and try again — Confirm still enabled because
    // checkbox + 6-digit input are still both satisfied.
    expect(screen.getByRole('button', { name: /Confirm/u })).toBeEnabled();
  });
});

describe('TwoFactorSection — already-enabled state (D-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the EmptyState info card when twoFactorEnabled=true', () => {
    render(<TwoFactorSection twoFactorEnabled={true} />);
    // The active label appears as both a heading-description and a body header;
    // assert presence by counting at least one element.
    expect(screen.getAllByText(/Two-factor authentication active/u).length).toBeGreaterThan(0);
    // D-23: no admin-reset UI, no recovery-code regeneration UI, no
    // email-recovery link. The only affordances shown are Disable + the
    // founder-runbook tooltip.
    expect(screen.queryByRole('button', { name: /Generate.*backup/iu })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reset 2FA for.*subordinate/iu }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Email me a recovery/iu })).not.toBeInTheDocument();
    // Founder-runbook affordance present
    expect(screen.getByText(/Contact founder support/u)).toBeInTheDocument();
    // Disable 2FA affordance
    expect(screen.getByRole('button', { name: /Disable 2FA/u })).toBeInTheDocument();
  });

  it('opens the disable-confirm dialog and calls disableTwoFactorAction with the password', async () => {
    disableTwoFactorMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<TwoFactorSection twoFactorEnabled={true} />);
    await user.click(screen.getByRole('button', { name: /Disable 2FA/u }));
    await user.type(screen.getByLabelText(/Current password/u), 's3cret-pwd');
    await user.click(screen.getByRole('button', { name: /Continue/u }));
    await waitFor(() => {
      expect(disableTwoFactorMock).toHaveBeenCalledWith('s3cret-pwd');
    });
  });
});
