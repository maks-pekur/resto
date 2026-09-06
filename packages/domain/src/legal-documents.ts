import { z } from 'zod';
import { LocalizedText } from './localized-text';

/**
 * What a restaurant has to be able to say in writing. Every one is optional — a venue publishes
 * what its market asks of it, and a guest surface shows only what exists.
 */
export const LEGAL_DOCUMENTS = [
  'about',
  'payment',
  'returns',
  'cookies',
  'terms',
  'privacy',
] as const;
export type LegalDocumentKey = (typeof LEGAL_DOCUMENTS)[number];

const document = LocalizedText.nullable().default(null);

export const LegalDocuments = z
  .object({
    /** Who the company legally is — registration, address, tax id in prose. */
    about: document,
    payment: document,
    returns: document,
    cookies: document,
    terms: document,
    privacy: document,
  })
  .strip();
export type LegalDocuments = z.infer<typeof LegalDocuments>;
