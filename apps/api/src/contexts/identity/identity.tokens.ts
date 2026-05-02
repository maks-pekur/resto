/**
 * DI tokens for the identity context. Extracted from `identity.module.ts`
 * so guards/adapters can import them without creating a circular import
 * cycle through the module class.
 */
export const AUTH_TOKEN = Symbol('Auth');
export const AUTH_DRIZZLE_TOKEN = Symbol('AuthDrizzle');
