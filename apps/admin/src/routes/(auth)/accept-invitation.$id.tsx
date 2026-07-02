import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { Route as authLayoutRoute } from './_layout';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/accept-invitation/$id',
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const navigate = useNavigate();
  const { id: invitationId } = Route.useParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const accept = async () => {
    setPending(true);
    setError(null);
    const res = await authClient.organization.acceptInvitation({ invitationId });
    setPending(false);
    if (res.error) {
      setError('Could not accept the invitation. It may have expired.');
      return;
    }
    void navigate({ to: '/' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Accept invitation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          You have been invited to join a restaurant account.
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={pending} onClick={() => void accept()}>
          {pending ? 'Joining…' : 'Accept invitation'}
        </Button>
      </CardContent>
    </Card>
  );
}
