/**
 * How long ago an ISO timestamp was, in the app's voice. Nothing here is scoped to one
 * workflow: the Level Editor's session attribution and Run adoption both have to say
 * "which of these is the one I was just using", and that is the same sentence.
 *
 * Beyond a day the answer stops being a duration anyone reasons about, so it becomes the
 * absolute local date/time instead of "31 hours ago".
 */
export function relativeTimeLabel(value: string | null | undefined, now = Date.now()): string {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (elapsedSeconds < 10) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleString();
}
