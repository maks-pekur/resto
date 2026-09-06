import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useDragToDismiss } from '@resto/ui';

const SHEET_HEIGHT = 400;

function Sheet({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const drag = useDragToDismiss(open, onDismiss);
  return (
    <div
      ref={drag.ref}
      data-testid="sheet"
      data-offset={drag.offset}
      style={{ transform: `translateY(${String(drag.offset)}px)` }}
    />
  );
}

const touch = (type: string, clientY: number, at: number): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientY }] });
  Object.defineProperty(event, 'timeStamp', { value: at });
  return event;
};

const mountSheet = (scrollTop: number) => {
  const onDismiss = vi.fn();
  const { getByTestId } = render(<Sheet open onDismiss={onDismiss} />);
  const sheet = getByTestId('sheet');
  Object.defineProperty(sheet, 'scrollTop', { value: scrollTop, writable: true });
  sheet.getBoundingClientRect = () => ({ height: SHEET_HEIGHT }) as DOMRect;
  return { sheet, onDismiss };
};

describe('useDragToDismiss', () => {
  it('throws the sheet away when it is pulled far enough down from its top', () => {
    const { sheet, onDismiss } = mountSheet(0);

    sheet.dispatchEvent(touch('touchstart', 100, 0));
    sheet.dispatchEvent(touch('touchmove', 300, 400));
    sheet.dispatchEvent(touch('touchend', 300, 400));

    expect(onDismiss).toHaveBeenCalled();
  });

  it('springs back when the pull is only a nudge', () => {
    const { sheet, onDismiss } = mountSheet(0);

    sheet.dispatchEvent(touch('touchstart', 100, 0));
    sheet.dispatchEvent(touch('touchmove', 130, 400));
    sheet.dispatchEvent(touch('touchend', 130, 400));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet.dataset.offset).toBe('0');
  });

  it('closes on a flick even though the finger did not travel far', () => {
    const { sheet, onDismiss } = mountSheet(0);

    sheet.dispatchEvent(touch('touchstart', 100, 0));
    sheet.dispatchEvent(touch('touchmove', 160, 60));
    sheet.dispatchEvent(touch('touchend', 160, 60));

    expect(onDismiss).toHaveBeenCalled();
  });

  it('leaves the content to scroll when the sheet is not at its top', () => {
    const { sheet, onDismiss } = mountSheet(120);

    sheet.dispatchEvent(touch('touchstart', 100, 0));
    sheet.dispatchEvent(touch('touchmove', 300, 400));
    sheet.dispatchEvent(touch('touchend', 300, 400));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet.dataset.offset).toBe('0');
  });
});
