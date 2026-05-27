import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../components/empty-state';

describe('EmptyState', () => {
  it('renders empty variant with Inbox icon and role status', () => {
    const { container } = render(
      <EmptyState
        variant="empty"
        title="No brands yet"
        description="Create your first brand to start publishing your menu."
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('No brands yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first brand to start publishing your menu.'),
    ).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders forbidden variant with role alert and Lock icon', () => {
    const { container } = render(
      <EmptyState
        variant="forbidden"
        title="Access required"
        description="Ask your tenant owner to grant access."
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Access required')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders action slot when passed', () => {
    render(
      <EmptyState
        variant="empty"
        title="No brands yet"
        description="Create your first brand."
        action={<button type="button">Create brand</button>}
      />,
    );
    expect(screen.getByRole('button', { name: /Create brand/u })).toBeInTheDocument();
  });

  it('does not render action wrapper when action is absent', () => {
    render(
      <EmptyState variant="empty" title="No brands yet" description="Create your first brand." />,
    );
    expect(screen.queryByRole('button', { name: /Create brand/u })).toBeNull();
  });

  it('accepts a custom icon override', () => {
    render(
      <EmptyState
        variant="empty"
        title="Custom"
        description="With custom icon"
        icon={<svg data-testid="custom-icon" />}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('applies custom className to the wrapper', () => {
    render(
      <EmptyState
        variant="empty"
        title="Custom class"
        description="With custom className"
        className="my-custom-class"
      />,
    );
    expect(screen.getByRole('status').className).toContain('my-custom-class');
  });
});
