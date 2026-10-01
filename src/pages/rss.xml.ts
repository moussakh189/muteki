import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async (context) => {
  const [writeups, blog] = await Promise.all([
    getCollection('writeups', ({ data }) => !data.draft),
    getCollection('blog', ({ data }) => !data.draft),
  ])

  const items = [
    ...writeups.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      description: entry.data.summary,
      link: `/writeups/${entry.id}/`,
      categories: entry.data.tags,
    })),
    ...blog.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      description: entry.data.summary,
      link: `/blog/${entry.id}/`,
      categories: entry.data.tags,
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

  return rss({
    title: 'muteki — CTF writeups & web security',
    description: 'CTF writeups, web vulnerability research, and methodology by Khenfri Moussa (Muteki).',
    site: context.site ?? 'https://muteki.sh',
    items,
    customData: '<language>en-us</language>',
  })
}
