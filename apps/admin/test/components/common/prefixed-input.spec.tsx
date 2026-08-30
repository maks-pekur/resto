import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrefixedInput } from '@/components/common/prefixed-input';

const renderInput = (value: string) => {
  const onValueChange = vi.fn();
  render(
    <PrefixedInput
      aria-label="Instagram"
      prefix="https://instagram.com/"
      value={value}
      onValueChange={onValueChange}
    />,
  );
  return onValueChange;
};

describe('PrefixedInput', () => {
  it('shows only the part the operator owns', () => {
    renderInput('https://instagram.com/caferoma');

    expect(screen.getByLabelText('Instagram')).toHaveValue('caferoma');
  });

  it('stores the whole address', async () => {
    const user = userEvent.setup();
    const onValueChange = renderInput('');

    await user.type(screen.getByLabelText('Instagram'), 'x');

    expect(onValueChange).toHaveBeenLastCalledWith('https://instagram.com/x');
  });

  it('swallows a pasted full link instead of doubling the prefix', async () => {
    const user = userEvent.setup();
    const onValueChange = renderInput('');

    await user.click(screen.getByLabelText('Instagram'));
    await user.paste('https://www.instagram.com/caferoma');

    expect(onValueChange).toHaveBeenLastCalledWith('https://instagram.com/caferoma');
  });

  it('clears the value rather than storing a bare prefix', async () => {
    const user = userEvent.setup();
    const onValueChange = renderInput('https://instagram.com/a');

    await user.clear(screen.getByLabelText('Instagram'));

    expect(onValueChange).toHaveBeenLastCalledWith('');
  });
});
