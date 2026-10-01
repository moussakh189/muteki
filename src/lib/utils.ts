/**
 * Format a Date object to a human-readable string: "Sep 15, 2026"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a Date object to ISO date string: "2026-09-15"
 */
export function formatDateIso(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Estimate reading time from raw text content
 * Returns a string like "5 min read"
 */
export function getReadingTime(body: string): string {
  const wpm = 200
  const words = body.trim().split(/\s+/).length
  const minutes = Math.max(1, Math.ceil(words / wpm))
  return `${minutes} min read`
}

/**
 * Slugify a string: lowercase, spaces → dashes, no special chars
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}
