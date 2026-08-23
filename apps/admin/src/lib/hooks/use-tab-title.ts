import * as React from 'react';

const DEFAULT_TITLE = 'Заказы';

export function useTabTitle(unacceptedCount: number): void {
  const baseTitleRef = React.useRef<string>(DEFAULT_TITLE);

  React.useEffect(() => {
    baseTitleRef.current = document.title;
    return () => {
      document.title = baseTitleRef.current;
    };
  }, []);

  React.useEffect(() => {
    document.title = unacceptedCount > 0 ? `(${unacceptedCount}) ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  }, [unacceptedCount]);
}
