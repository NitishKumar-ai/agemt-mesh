import { z } from 'zod';

export const SectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.enum(['markdown', 'list', 'table', 'alert', 'key_value']),
  data: z.any().optional(),
});

export type Section = z.infer<typeof SectionSchema>;

export const CitationSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  exact_text: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type Citation = z.infer<typeof CitationSchema>;

export const WorkflowOutputSchema = z.object({
  workflow_id: z.string(),
  tenant_id: z.string(),
  scope: z.string(),
  generated_at: z.string(),
  sections: z.array(SectionSchema),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
  correction_url: z.string(),
});

export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;
