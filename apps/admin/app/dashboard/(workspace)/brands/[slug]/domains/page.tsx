export default function BrandDomainsPage(_: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">Domains</h1>
        <p className="text-muted-foreground text-sm">
          Per-brand custom domains ship in a follow-up ticket.
        </p>
      </div>
    </>
  );
}
