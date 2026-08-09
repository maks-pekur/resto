import { SetMetadata } from '@nestjs/common';

export const OWNER_ONLY_KEY = 'identity:owner-only';

export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);
