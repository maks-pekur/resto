import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useDragToDismiss } from '@resto/ui';

const touch = (type: string, clientY: number, timeStamp = 0): Event => {
  const event = new Event(type, { bubbles: true, cancelable: type === 'touchmove' });
  Object.defineProperty(event, 'touches', { value: [{ clientY }] });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
};

const SHEET_HEIGHT = 400;

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const [, rerender] = useState(0);
  // A parent that re-renders on every drag frame is the normal case: the sheet moves with it.
  const drag = useDragToDismiss(true, () => {
    onDismiss();
  });
  return (
    <div
      data-testid="sheet"
      style={{ transform: drag.offset > 0 ? `translateY(${String(drag.offset)}px)` : undefined }}
      ref={(node) => {
        drag.ref.current = node;
        if (node) node.getBoundingClientRect = () => ({ height: SHEET_HEIGHT }) as DOMRect;
      }}
      onClick={() => {
        rerender((n) => n + 1);
      }}
    />
  );
}

const drag = (sheet: HTMLElement, distance: number): void => {
  act(() => {
    sheet.dispatchEvent(touch('touchstart', 0));
  });
  act(() => {
    sheet.dispatchEvent(touch('touchmove', distance));
  });
  act(() => {
    sheet.dispatchEvent(touch('touchend', distance));
  });
};

describe('useDragToDismiss', () => {
  it('closes the sheet when the pull passes a quarter of its height', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);

    drag(getByTestId('sheet'), SHEET_HEIGHT / 2);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet when the pull is short and slow', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const sheet = getByTestId('sheet');

    act(() => {
      sheet.dispatchEvent(touch('touchstart', 0, 0));
    });
    act(() => {
      sheet.dispatchEvent(touch('touchmove', 10, 500));
    });
    // Slow as well as short: a second for 10px is nothing like a flick.
    act(() => {
      sheet.dispatchEvent(touch('touchend', 10, 1_000));
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('subscribes once and stays subscribed through re-renders', () => {
    const added = vi.spyOn(Element.prototype, 'addEventListener');
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const sheet = getByTestId('sheet');

    act(() => {
      sheet.click();
    });
    act(() => {
      sheet.click();
    });

    // Re-attaching mid-drag is what made the gesture work only every other time: a touchmove
    // listener added after the gesture began no longer gets to call preventDefault.
    const subscribers: unknown[] = added.mock.instances;
    const touchmoveSubscriptions = added.mock.calls.filter(
      ([type], index) => type === 'touchmove' && subscribers[index] === sheet,
    ).length;
    expect(touchmoveSubscriptions).toBe(1);

    drag(sheet, SHEET_HEIGHT / 2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    added.mockRestore();
  });
});

describe('how far the pull goes', () => {
  it('follows the thumb, then resists so the sheet cannot be dragged off the screen', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    const sheet = getByTestId('sheet');

    act(() => {
      sheet.dispatchEvent(touch('touchstart', 0, 0));
    });
    act(() => {
      sheet.dispatchEvent(touch('touchmove', 100, 100));
    });
    const followed = sheet.style.transform;

    act(() => {
      sheet.dispatchEvent(touch('touchmove', 620, 200));
    });
    const resisted = sheet.style.transform;

    expect(followed).toBe('translateY(100px)');
    // 220 of travel at full speed, the remaining 400 at 40%.
    expect(resisted).toBe('translateY(380px)');
  });
});
