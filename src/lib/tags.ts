import { getCollection } from 'astro:content'

/**
 * Get all unique tags across all three collections,
 * sorted by frequency (most used first).
 */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const [writeups, blog, playbook] = await Promise.all([
    getCollection('writeups', ({ data }) => !data.draft),
    getCollection('blog', ({ data }) => !data.draft),
    getCollection('playbook', ({ data }) => !data.draft),
  ])

  const all = [...writeups, ...blog, ...playbook]
  const counts: Record<string, number> = {}

  for (const entry of all) {
    for (const tag of entry.data.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1
    }
  }

  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
}
