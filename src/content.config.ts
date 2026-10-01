import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const writeups = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/writeups" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    ctf: z.string(),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
})

const playbook = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/playbook" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
})

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    summary: z.string(),
    draft: z.boolean().default(false),
  }),
})

export const collections = { writeups, playbook, blog }
