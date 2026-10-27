/**
 * The request's notion of now, for server components that count down to an
 * appointment or measure against a deadline. They render once per request
 * (every page is dynamic), so reading the clock here is safe.
 */
export function requestNow(): number {
  return Date.now()
}
