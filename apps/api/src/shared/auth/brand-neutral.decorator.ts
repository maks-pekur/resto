import { SetMetadata } from '@nestjs/common';

export const BRAND_NEUTRAL_KEY = 'identity:brand-neutral';

export const BrandNeutral = () => SetMetadata(BRAND_NEUTRAL_KEY, true);
