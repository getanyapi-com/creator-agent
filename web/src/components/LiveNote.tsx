/** Shown with a live run's steps, so a quiet minute does not read as stuck. */
export function LiveNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-small text-fg-muted ${className}`}>
      A question takes 2 to 8 minutes. You can leave this page and come back; the research keeps going.
    </p>
  );
}
