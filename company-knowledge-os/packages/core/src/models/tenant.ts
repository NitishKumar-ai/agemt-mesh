import { z } from 'zod';

export const TenantSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1),
  region: z.string().optional(),
  policy_profile: z.record(z.string(), z.any()).optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export interface ITenant {
  tenant_id: string;
  name: string;
  region?: string;
  policy_profile?: Record<string, any>;
  created_at: Date;
  updated_at?: Date;
}