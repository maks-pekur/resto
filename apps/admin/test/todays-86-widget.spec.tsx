import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const { TodaysWidget } = await import('@/components/menu/todays-86-widget');

describe('TodaysWidget', () => {
  it('renders the title and the count badge when count > 0', () => {
    render(<TodaysWidget count={3} />);
    expect(screen.getByText('Стоп-лист сегодня')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Все остановленные позиции будут возобновлены.')).toBeInTheDocument();
  });

  it('shows the empty hint when count is zero', () => {
    render(<TodaysWidget count={0} />);
    expect(screen.getByText('Стоп-лист пуст.')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
