import * as React from 'react';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

export type OrderNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export interface OrderNotificationMessage {
  readonly title: string;
  readonly body: string;
}

export interface UseOrderNotificationsResult {
  readonly permission: OrderNotificationPermission;
  readonly request: () => void;
}

const readPermission = (): OrderNotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
};

/**
 * A browser notification for every order that appears while the operator is looking at
 * something else. Deliberately silent when the tab is visible — the feed, the chime and a
 * popup all firing at once is three signals for one order.
 */
export function useOrderNotifications(
  unacceptedRows: readonly OrderFeedRowApi[],
  buildMessage: (row: OrderFeedRowApi) => OrderNotificationMessage,
): UseOrderNotificationsResult {
  const [permission, setPermission] = React.useState<OrderNotificationPermission>(readPermission);
  const seenIdsRef = React.useRef<ReadonlySet<string> | null>(null);
  const buildMessageRef = React.useRef(buildMessage);
  buildMessageRef.current = buildMessage;

  React.useEffect(() => {
    const currentIds = new Set(unacceptedRows.map((row) => row.id));
    const seen = seenIdsRef.current;
    seenIdsRef.current = currentIds;

    // The first feed a session sees is history, not news — notifying for it would greet the
    // operator with a stack of popups for orders that have been on screen all along.
    if (seen === null) return;
    if (permission !== 'granted') return;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') return;

    for (const row of unacceptedRows) {
      if (seen.has(row.id)) continue;
      const message = buildMessageRef.current(row);
      new window.Notification(message.title, { body: message.body, tag: row.id });
    }
  }, [unacceptedRows, permission]);

  const request = React.useCallback((): void => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    void window.Notification.requestPermission().then((next) => {
      setPermission(next);
    });
  }, []);

  return { permission, request };
}
