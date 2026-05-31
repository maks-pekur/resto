export function SiteFooter() {
  return (
    <footer className="bg-background border-t">
      <div className="text-muted-foreground flex items-center justify-between px-4 py-4 text-xs lg:px-6">
        <span>RestOS · operator console</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
