import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@resto/domain';
import { PERMISSIONS_KEY } from '../guards/permissions.guard';

/**
 * Marks an endpoint with a required permission spec. PermissionsGuard
 * reads the metadata and delegates to PermissionChecker.
 */
export const Permissions = (spec: Permission) => SetMetadata(PERMISSIONS_KEY, spec);
