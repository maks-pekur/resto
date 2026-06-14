import { SetMetadata } from '@nestjs/common';

export const REQUIRE_BRAND_KEY = 'identity:require-brand';

/**
 * Marks a route or controller as brand-scoped — BrandScopeGuard checks
 * `member_brand_scope` for the current operator and rejects when the
 * request's brand is not in their explicit scope. Empty scope rows mean
 * the operator sees all brands of their tenant (default-allow per
 * ADR-0019 §5.3); `owner` baseRole always bypasses.
 */
export const RequireBrand = () => SetMetadata(REQUIRE_BRAND_KEY, true);
