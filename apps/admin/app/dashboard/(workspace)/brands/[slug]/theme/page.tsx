export default function BrandThemePage(_: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">Theme</h1>
        <p className="text-muted-foreground text-sm">Per-brand theme editor ships with RES-91.</p>
      </div>
    </>
  );
}
