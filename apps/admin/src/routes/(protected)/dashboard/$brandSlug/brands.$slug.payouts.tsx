import { useMutation, useQuery } from '@tanstack/react-query';
import { createRoute, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Route as brandSlugLayoutRoute } from '../_layout';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getStripeStatus, startStripeOnboarding } from '@/lib/payments-api';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/brands/$slug/payouts',
  component: BrandPayoutsPage,
});

function BrandPayoutsPage() {
  const { brandSlug } = useParams({ strict: false });

  const statusQuery = useQuery({
    queryKey: ['stripe-status'],
    queryFn: getStripeStatus,
  });

  const onboardMutation = useMutation({
    mutationFn: startStripeOnboarding,
    onSuccess: (res) => {
      if (!res.ok || res.data === null) {
        toast.error('Failed to start Stripe onboarding. Please try again.');
        return;
      }
      window.location.href = res.data.onboardingUrl;
    },
    onError: () => toast.error('Request failed. Please try again.'),
  });

  const status = statusQuery.data?.data;
  const isLoading = statusQuery.isLoading;
  const isPending = onboardMutation.isPending;

  const buttonLabel =
    status?.onboardingStatus === 'not_started' || status === undefined
      ? 'Connect Stripe'
      : 'Continue onboarding';

  return (
    <>
      <PageHeading title="Brand Payouts" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Stripe Connect</CardTitle>
            <CardDescription>
              Accept payments for <span className="font-mono">{brandSlug}</span> via Stripe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading payment status…</p>
            ) : status?.canAcceptPayments ? (
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-medium">
                  Payments active
                </span>
                <p className="text-muted-foreground text-sm">
                  Your Stripe account is verified and ready to accept payments.
                </p>
              </div>
            ) : status?.onboardingStatus === 'restricted' ? (
              <div className="flex flex-col gap-3">
                <span className="bg-red-100 text-red-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
                  Restricted — additional info required
                </span>
                {Array.isArray(status.requirementsDue) && status.requirementsDue.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    Requirements due: {(status.requirementsDue as string[]).join(', ')}
                  </p>
                )}
                <Button
                  onClick={() => { onboardMutation.mutate(); }}
                  disabled={isPending}
                  className="w-fit"
                >
                  {isPending ? 'Redirecting…' : buttonLabel}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="bg-yellow-100 text-yellow-800 rounded-full px-3 py-1 text-sm font-medium w-fit">
                  Onboarding pending — finish Stripe verification
                </span>
                <p className="text-muted-foreground text-sm">
                  Connect your Stripe account to start accepting payments from guests.
                </p>
                <Button
                  onClick={() => { onboardMutation.mutate(); }}
                  disabled={isPending}
                  className="w-fit"
                >
                  {isPending ? 'Redirecting…' : buttonLabel}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
