import { z } from 'zod';

export const PaymentProvider = z.enum(['stripe']);
export type PaymentProvider = z.infer<typeof PaymentProvider>;

export const AccountType = z.enum(['express', 'standard']);
export type AccountType = z.infer<typeof AccountType>;

export const PaymentOnboardingStatus = z.enum(['not_started', 'pending', 'complete', 'restricted']);
export type PaymentOnboardingStatus = z.infer<typeof PaymentOnboardingStatus>;
