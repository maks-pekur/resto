import type { BetterAuthPlugin, Where } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

const switchOrganizationBodySchema = z.object({
  organizationId: z.string().uuid(),
});

interface MemberRow {
  organizationId: string;
}

interface OrganizationRow {
  id: string;
  slug: string;
}

/**
 * D-15/D-16: revoke-and-reissue organization switch. Stock BA
 * `/organization/set-active` mutates the session in place, keeping the same
 * token — it cannot satisfy "one session = one organization, for the life
 * of that session". This endpoint issues a brand-new session bound to the
 * target organization and hard-deletes the old one.
 */
export const organizationSwitch = (): BetterAuthPlugin => ({
  id: 'organization-switch',
  endpoints: {
    switchOrganization: createAuthEndpoint(
      '/switch-organization',
      { method: 'POST', use: [sessionMiddleware], requireHeaders: true },
      async (ctx) => {
        const { user, session } = ctx.context.session;

        const parsedBody = switchOrganizationBodySchema.safeParse(ctx.body);
        if (!parsedBody.success) {
          throw new APIError('BAD_REQUEST', {
            message: 'organizationId must be a valid uuid',
          });
        }
        const targetOrganizationId = parsedBody.data.organizationId;

        const membership = await ctx.context.adapter.findOne<MemberRow>({
          model: 'member',
          where: [
            { field: 'userId', operator: 'eq', value: user.id },
            { field: 'organizationId', operator: 'eq', value: targetOrganizationId },
          ] satisfies Where[],
        });
        if (!membership) {
          throw new APIError('FORBIDDEN', {
            message: 'You are not a member of this organization.',
          });
        }

        const organization = await ctx.context.adapter.findOne<OrganizationRow>({
          model: 'organization',
          where: [{ field: 'id', operator: 'eq', value: targetOrganizationId }] satisfies Where[],
        });
        if (!organization) {
          throw new APIError('FORBIDDEN', {
            message: 'You are not a member of this organization.',
          });
        }

        const newSession = await ctx.context.internalAdapter.createSession(user.id, false, {
          activeOrganizationId: targetOrganizationId,
          activeLocationId: null,
        });

        await ctx.context.internalAdapter.deleteSession(session.token);

        await setSessionCookie(ctx, { session: newSession, user }, false);

        return ctx.json({ organizationId: targetOrganizationId, slug: organization.slug });
      },
    ),
  },
});
