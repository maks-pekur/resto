import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const requestService = vi.fn();
vi.mock('../src/api/client', () => ({ requestService }));
vi.mock('../src/i18n', () => ({ t: (key: string) => key }));

const { ServiceCalls } = await import('../src/components/ServiceCalls');

describe('ServiceCalls', () => {
  beforeEach(() => {
    requestService.mockReset().mockResolvedValue(true);
  });

  it('calls a waiter and then says one is coming', async () => {
    render(<ServiceCalls />);

    fireEvent.click(screen.getByTestId('service-waiter'));

    await waitFor(() => {
      expect(requestService).toHaveBeenCalledWith('waiter');
    });
    expect(await screen.findByText('service.waiterAsked')).toBeInTheDocument();
    expect(screen.getByTestId('service-waiter')).toBeDisabled();
  });

  it('asks for the bill separately from the waiter', async () => {
    render(<ServiceCalls />);

    fireEvent.click(screen.getByTestId('service-bill'));

    await waitFor(() => {
      expect(requestService).toHaveBeenCalledWith('bill');
    });
    expect(screen.getByTestId('service-waiter')).not.toBeDisabled();
  });

  it('stays askable when the call did not go through', async () => {
    requestService.mockResolvedValue(false);
    render(<ServiceCalls />);

    fireEvent.click(screen.getByTestId('service-waiter'));

    await waitFor(() => {
      expect(screen.getByTestId('service-waiter')).not.toBeDisabled();
    });
    expect(screen.getByText('service.waiter')).toBeInTheDocument();
  });
});
