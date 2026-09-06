export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`zoned-day: could not format a date key for timeZone=${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}

export function zonedMidnightUtc(reference: Date, timeZone: string): Date {
  const dateKey = formatDateKeyInTimeZone(reference, timeZone);
  const guess = new Date(`${dateKey}T00:00:00.000Z`);

  const wallClock = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(guess);
  const get = (type: string): number =>
    Number(wallClock.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour');

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour === 24 ? 0 : hour,
    get('minute'),
    get('second'),
  );
  const offsetMs = asUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}
