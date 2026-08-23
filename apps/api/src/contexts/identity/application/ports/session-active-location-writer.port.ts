export const SESSION_ACTIVE_LOCATION_WRITER = Symbol('SESSION_ACTIVE_LOCATION_WRITER');

export interface SessionActiveLocationWriter {
  writeActiveLocation(input: {
    sessionToken: string;
    activeLocationId: string | null;
  }): Promise<void>;
  readActiveLocationId(sessionToken: string): Promise<string | null>;
}
