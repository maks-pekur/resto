export default function BrandPayoutsPage(_: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="text-muted-foreground text-sm">
          Stripe Connect onboarding ships in a follow-up ticket.
        </p>
      </div>
    </>
  );
}
