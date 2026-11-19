/**
 * Instant loading state for every Party HQ page.
 *
 * Each page checks the session (cookies + database) at request time. On a client navigation
 * the panel layout stays mounted, so its own <Suspense> doesn't apply; this file puts a
 * boundary right around the page instead, so the skeleton shows on click while the page streams in.
 */
export default function PanelLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/70" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
