export const SESSION_ACTIVE_BRAND_WRITER = Symbol('SESSION_ACTIVE_BRAND_WRITER');

export interface SessionActiveBrandWriter {
  writeActiveBrand(input: { sessionToken: string; activeBrandId: string }): Promise<void>;
}
