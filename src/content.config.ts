import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { categories } from './lib/model';

export const collections = {
  attachments: defineCollection({
    loader: glob({ pattern: '*/attachments/*.md', base: './src/content/posts', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
    schema: z.object({}).strict(),
  }),
  posts: defineCollection({
    loader: glob({ pattern: '*/index.md', base: './src/content/posts' }),
    schema: z.object({
      title: z.string().min(1),
      description: z.string().min(1).max(180),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateBasis: z.enum(['published', 'first-public-commit', 'modified']),
      category: z.enum(categories),
      tags: z.array(z.string().min(1)).min(1),
      permalink: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      author: z.literal('ChengzhiHuang'),
    }).strict(),
  }),
};
