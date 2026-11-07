import { z } from 'zod';

export const briefSchema = z.object({
  kind: z.enum(['value', 'policy', 'fact']),
  definitions: z.string().max(1200),
  scope: z.string().max(1200),
  criterion: z.string().max(1200),
  proBurden: z.string().max(1200),
  conBurden: z.string().max(1200),
});

export const evidenceSchema = z
  .array(
    z.object({
      id: z.string().regex(/^E[1-9]\d{0,5}$/),
      title: z.string().trim().min(1).max(120),
      kind: z.enum(['source', 'example', 'hypothesis']),
      content: z.string().trim().min(1).max(2400),
      source: z.string().max(1000),
    })
  )
  .max(12)
  .refine(
    (cards) => new Set(cards.map((card) => card.id)).size === cards.length,
    '资料编号不能重复'
  );

export const stageSchema = z.enum([
  'free',
  'opening',
  'question',
  'answer',
  'rebuttal',
  'closing',
  'overtime',
]);
