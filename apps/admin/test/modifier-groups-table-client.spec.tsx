import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModifierGroupsTableClient } from '../app/dashboard/(workspace)/menu/modifier-groups/modifier-groups-table-client';

const ROW_A = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Соусы',
  minSelectable: 0,
  maxSelectable: 3,
  optionCount: 4,
  usageCount: 6,
};

const ROW_UNLIMITED = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Дополнения',
  minSelectable: 0,
  maxSelectable: 0,
  optionCount: 2,
  usageCount: 1,
};

describe('ModifierGroupsTableClient (Plan 04b-08 Task 2)', () => {
  it('renders group name as a link to the editor', () => {
    render(<ModifierGroupsTableClient items={[ROW_A]} />);
    const link = screen.getByText('Соусы').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/dashboard/menu/modifier-groups/' + ROW_A.id);
  });

  it('renders min–max numeric range', () => {
    render(<ModifierGroupsTableClient items={[ROW_A]} />);
    expect(screen.getByText('0–3')).toBeInTheDocument();
  });

  it('shows infinity glyph when maxSelectable is 0 (unlimited)', () => {
    render(<ModifierGroupsTableClient items={[ROW_UNLIMITED]} />);
    expect(screen.getByText('0–∞')).toBeInTheDocument();
  });

  it('renders option count + usage count', () => {
    render(<ModifierGroupsTableClient items={[ROW_A]} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
