import { SetMetadata } from '@nestjs/common';

export const LOCATION_NEUTRAL_KEY = 'identity:location-neutral';

export const LocationNeutral = () => SetMetadata(LOCATION_NEUTRAL_KEY, true);
