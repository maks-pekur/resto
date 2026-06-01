import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BjuRow } from '@/components/menu/bju-row';

describe('BjuRow (Plan 04b-07 Task 3)', () => {
  it('renders four numeric inputs labelled Б, Ж, У, ккал', () => {
    render(
      <BjuRow
        proteins={3.2}
        fats={4.1}
        carbs={6.8}
        kcal={80}
        nutritionEstimated={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Б')).toBeInTheDocument();
    expect(screen.getByLabelText('Ж')).toBeInTheDocument();
    expect(screen.getByLabelText('У')).toBeInTheDocument();
    expect(screen.getByLabelText('ккал')).toBeInTheDocument();
  });

  it('renders the AI-оценка badge when nutritionEstimated is true', () => {
    render(
      <BjuRow
        proteins={null}
        fats={null}
        carbs={null}
        kcal={null}
        nutritionEstimated={true}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('AI-оценка')).toBeInTheDocument();
  });

  it('does NOT render the badge when nutritionEstimated is false', () => {
    render(
      <BjuRow
        proteins={null}
        fats={null}
        carbs={null}
        kcal={null}
        nutritionEstimated={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByText('AI-оценка')).not.toBeInTheDocument();
  });

  it('emits null on empty input', () => {
    const onChange = vi.fn();
    render(
      <BjuRow
        proteins={5}
        fats={null}
        carbs={null}
        kcal={null}
        nutritionEstimated={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Б'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('proteins', null);
  });

  it('emits parsed float on numeric input for proteins', () => {
    const onChange = vi.fn();
    render(
      <BjuRow
        proteins={null}
        fats={null}
        carbs={null}
        kcal={null}
        nutritionEstimated={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Б'), { target: { value: '3.5' } });
    expect(onChange).toHaveBeenCalledWith('proteins', 3.5);
  });

  it('emits integer for kcal', () => {
    const onChange = vi.fn();
    render(
      <BjuRow
        proteins={null}
        fats={null}
        carbs={null}
        kcal={null}
        nutritionEstimated={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('ккал'), { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith('kcal', 120);
  });
});
