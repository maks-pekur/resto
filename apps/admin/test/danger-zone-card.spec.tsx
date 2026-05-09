import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DangerZoneCard } from '../components/danger-zone-card';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/dashboard/settings/actions', () => ({
  scheduleOffboardingAction: vi.fn(),
  cancelOffboardingAction: vi.fn(),
}));

describe('DangerZoneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows owner-only message for non-owner', () => {
    render(
      <DangerZoneCard
        tenant={{ slug: 'cafe-x', status: 'active', offboardingScheduledAt: null }}
        isOwner={false}
      />,
    );
    expect(screen.getByText(/Only the tenant owner can manage offboarding/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Schedule offboarding/ })).not.toBeInTheDocument();
  });

  it('shows schedule button for active owner', () => {
    render(
      <DangerZoneCard
        tenant={{ slug: 'cafe-x', status: 'active', offboardingScheduledAt: null }}
        isOwner={true}
      />,
    );
    expect(screen.getByRole('button', { name: /Schedule offboarding/ })).toBeInTheDocument();
  });

  it('shows cancel button for pending_offboarding owner', () => {
    render(
      <DangerZoneCard
        tenant={{
          slug: 'cafe-x',
          status: 'pending_offboarding',
          offboardingScheduledAt: new Date().toISOString(),
        }}
        isOwner={true}
      />,
    );
    expect(screen.getByRole('button', { name: /Cancel offboarding/ })).toBeInTheDocument();
    expect(screen.getByText(/30 days until cool-off ends/)).toBeInTheDocument();
  });

  it('shows erased state', () => {
    render(
      <DangerZoneCard
        tenant={{ slug: 'cafe-x', status: 'erased', offboardingScheduledAt: null }}
        isOwner={true}
      />,
    );
    expect(screen.getByText(/Tenant erased/)).toBeInTheDocument();
  });

  it('shows generic state for archived/suspended', () => {
    render(
      <DangerZoneCard
        tenant={{ slug: 'cafe-x', status: 'suspended', offboardingScheduledAt: null }}
        isOwner={true}
      />,
    );
    expect(screen.getByText(/Tenant is suspended/)).toBeInTheDocument();
  });
});
