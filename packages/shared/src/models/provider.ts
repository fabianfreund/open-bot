import { z } from 'zod';

/** A tunable a provider exposes to the settings UI. */
export const ProviderOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  options: z.array(z.string()).optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
});
export type ProviderOption = z.infer<typeof ProviderOptionSchema>;

export const ProviderInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
  /** Whether this provider can accept skills as callable tools. */
  supportsSkills: z.boolean().default(true),
  options: z.array(ProviderOptionSchema).default([]),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const ProviderHealthSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  detail: z.string(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
