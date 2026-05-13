import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@resto/domain';

export const PERMISSIONS_KEY = 'identity:permissions';

export const Permissions = (spec: Permission) => SetMetadata(PERMISSIONS_KEY, spec);
