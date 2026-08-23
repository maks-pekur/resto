import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Route as protectedLayoutRoute } from '../_layout';
import { apiFetch } from '@/lib/api-client';
import { slugifyTenantName } from '@/lib/slugify-tenant';
import { adminUrlForTenant } from '@/lib/admin-host';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/onboarding',
  component: OnboardingPage,
});

interface OnboardingResponse {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

interface ProblemDetails {
  type?: string;
  code?: string;
  message?: string;
  detail?: string;
  status?: number;
}

const MIN_NAME_LEN = 1;

function OnboardingPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'onboarding' });
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previewHost = adminUrlForTenant(
    slugifyTenantName(displayName) || 'your-restaurant',
  ).replace(/^https?:\/\//, '');

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed.length < MIN_NAME_LEN) return;
    setPending(true);
    setError(null);
    // D-30: name only — the slug is derived server-side; collisions are
    // resolved silently via auto-suffix, never surfaced as a "taken" error.
    const res = await apiFetch<OnboardingResponse | ProblemDetails>('/v1/me/tenants/onboarding', {
      method: 'POST',
      body: { displayName: trimmed },
    });
    setPending(false);
    if (!res.ok) {
      const body = res.data as ProblemDetails | null;
      setError(body?.message ?? body?.detail ?? t('errorGeneric'));
      return;
    }
    const tenant = res.data as OnboardingResponse;
    await queryClient.invalidateQueries({ queryKey: ['identity'] });
    toast.success(t('createdToast', { name: tenant.displayName }));
    // The server-returned slug wins, not the locally-previewed one — it may
    // differ after collision resolution.
    window.location.assign(adminUrlForTenant(tenant.slug, '/dashboard'));
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">{t('nameLabel')}</Label>
                <Input
                  id="displayName"
                  required
                  minLength={1}
                  maxLength={120}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                  }}
                />
                {/* Advisory only — the server may append a suffix on collision
                    and its returned slug is authoritative. */}
                <p className="font-mono text-muted-foreground text-xs">
                  {t('hostPreview', { host: previewHost })}
                </p>
              </div>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t('submitPending') : t('submitIdle')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
