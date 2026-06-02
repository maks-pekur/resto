import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-client', () => ({
  PhotoUploadClient: () => <div data-testid="photo-upload" />,
}));

const { ItemAsideClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-aside-client');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

const baseProps = {
  itemId: ITEM_ID,
  currentPhotoS3Key: null as string | null,
  currentPhotoUrl: null as string | null,
  onPhotoChange: vi.fn(),
  status: 'draft' as const,
  slug: 'kapuchino',
};

describe('ItemAsideClient', () => {
  it('renders the embedded PhotoUploadClient', () => {
    render(<ItemAsideClient {...baseProps} />);
    expect(screen.getByTestId('photo-upload')).toBeInTheDocument();
  });

  it('renders the status badge with the managed-from-list hint when published', () => {
    render(<ItemAsideClient {...baseProps} status="published" />);
    expect(screen.getByText(/Опубликовано/u)).toBeInTheDocument();
    expect(screen.getByText(/Управляется из списка блюд\./u)).toBeInTheDocument();
  });

  it('renders the paused status label without throwing', () => {
    render(<ItemAsideClient {...baseProps} status="paused" />);
    expect(screen.getByText(/Стоп/u)).toBeInTheDocument();
  });

  it('renders the slug in the tech-info row', () => {
    render(<ItemAsideClient {...baseProps} />);
    expect(screen.getByText('kapuchino')).toBeInTheDocument();
  });

  it('renders an em-dash for empty slug (new item)', () => {
    render(<ItemAsideClient {...baseProps} itemId="new" slug="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
