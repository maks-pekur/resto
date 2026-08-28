/**
 * Pages whose content is scoped to one location, and therefore the only pages where `?location=`
 * belongs in the URL.
 *
 * Everything else is tenant-grain — the locations list shows every location, the team page every
 * member — so a location filter there is noise at best and misleading at worst. The switcher used
 * to write the param onto whatever page happened to be open, producing addresses like
 * `/locations?location=<uuid>`, which reads as "this list is filtered" when it is not.
 */
const LOCATION_SCOPED_PREFIXES: readonly string[] = [
  '/dashboard',
  '/orders',
  '/menu/stop-list',
  '/menu/items',
];

export const isLocationScopedPath = (pathname: string): boolean => {
  // The dashboard is also the protected index.
  if (pathname === '/' || pathname === '') return true;
  return LOCATION_SCOPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};
