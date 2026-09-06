import { z } from 'zod';

/**
 * The fourteen the EU requires a menu to declare (Regulation 1169/2011, Annex II). A restaurant
 * outside the EU may still use them — the list is the widest common vocabulary there is.
 */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const AllergenSchema = z.enum(ALLERGENS);

/** What a guest filters by when a whole category of the menu is closed to them. */
export const DIETS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'lactose_free',
  'spicy',
  'halal',
] as const;
export type Diet = (typeof DIETS)[number];
export const DietSchema = z.enum(DIETS);
