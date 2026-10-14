import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    section: z.enum(['posts', 'notes', 'questions']).default('posts'),
    description: z.string().optional(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    slug: z.string().optional(),
    cover: z.string().optional(),
    tags: z
      .preprocess((value) => {
        if (Array.isArray(value)) return value
        if (typeof value === 'string' && value.trim()) return [value]
        return []
      }, z.array(z.string()))
      .default([]),
  }),
})

const thoughts = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.{md,mdx}',
    base: './src/content/thoughts',
  }),
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
  }),
})

const albums = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.{md,mdx}',
    base: './src/content/albums',
  }),
  schema: z.object({
    alt: z.string().optional(),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().optional(),
    height: z.number().optional(),
    location: z.string().optional(),
    src: z.string().min(1),
    thumb: z.string().min(1),
    title: z.string(),
    width: z.number().optional(),
  }),
})

export const collections = { posts, thoughts, albums }
