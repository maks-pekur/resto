import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { CartIcon, GuestUiProvider, InfoIcon, MenuIcon } from '@resto/ui';
import { TabBar } from '../src/components/TabBar';

const renderBar = (badge?: number) => {
  const onCart = vi.fn();
  render(
    <GuestUiProvider locale="ru" t={(key) => key}>
      <TabBar
        ariaLabel="nav.label"
        active="menu"
        tabs={[
          { id: 'menu', label: 'Меню', icon: MenuIcon, onSelect: vi.fn() },
          ...(badge === undefined
            ? []
            : [{ id: 'cart', label: 'Корзина', icon: CartIcon, badge, onSelect: onCart }]),
          { id: 'info', label: 'Инфо', icon: InfoIcon, onSelect: vi.fn() },
        ]}
      />
    </GuestUiProvider>,
  );
  return onCart;
};

const scrollTo = async (y: number): Promise<void> => {
  window.scrollY = y;
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve(null);
      });
    });
  });
};

describe('TabBar', () => {
  it('marks the open tab for assistive tech', () => {
    renderBar();

    expect(screen.getByTestId('guest-tab-menu')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('guest-tab-info')).not.toHaveAttribute('aria-current');
  });

  it('carries the cart count', () => {
    renderBar(3);

    expect(screen.getByTestId('guest-tab-cart')).toHaveTextContent('3');
  });

  it('hides an empty cart count rather than showing a zero', () => {
    renderBar(0);

    expect(screen.getByTestId('guest-tab-cart').textContent).not.toContain('0');
  });

  it('gives room back while the guest reads down, and takes it back at the top', async () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'nav.label' });

    await scrollTo(400);
    expect(nav).toHaveAttribute('data-compact');

    await scrollTo(0);
    expect(nav).not.toHaveAttribute('data-compact');
  });

  it('opens the cart from its tab', () => {
    const onCart = renderBar(1);

    fireEvent.click(screen.getByTestId('guest-tab-cart'));

    expect(onCart).toHaveBeenCalled();
  });
});
