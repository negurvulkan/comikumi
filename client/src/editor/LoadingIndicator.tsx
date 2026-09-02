/** A small animated loading/progress indicator — spinner for an indeterminate wait
 * (most of the app's slow operations: model inference, file parsing, ZIP generation),
 * a filled bar for the handful of places that already compute a real current/total
 * (model download bytes, export job page counts). Deliberately just the visual element,
 * not a banner/toast of its own — every call site already has its own status-message
 * `<div>` (PageGrid.tsx/Editor.tsx's shared info-banner, ExportViewer.tsx's titlebar,
 * etc.); this renders inline next to that existing text rather than replacing it, so
 * adding a progress indicator to a screen never means restructuring that screen's
 * existing message plumbing. Lives next to ConfirmDialog.tsx/other cross-cutting UI in
 * editor/ rather than a new top-level folder, matching this codebase's existing
 * convention for shared-but-not-route components. */
export function LoadingIndicator({ progress, size = "md" }: { progress?: { current: number; total: number } | null; size?: "sm" | "md" }) {
  if (progress && progress.total > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)));
    return (
      <span className={`loading-indicator loading-indicator-${size}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="loading-bar-track">
          <span className="loading-bar-fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }
  return (
    <span className={`loading-indicator loading-indicator-${size}`} role="progressbar" aria-label="loading">
      <span className="loading-spinner" />
    </span>
  );
}
