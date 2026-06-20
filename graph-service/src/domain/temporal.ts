import { z } from 'zod';

export const TemporalQuerySchema = z.object({
  validAt: z.string().datetime().optional(), // Real-world time
  asOf: z.string().datetime().optional(),    // System recorded time
});

export type TemporalQuery = z.infer<typeof TemporalQuerySchema>;

/**
 * Checks if a record is active/valid for the given bitemporal coordinates.
 * If coordinate is not specified, it defaults to the current system time.
 */
export function isTemporalMatch(
  record: {
    valid_from: string | null;
    valid_to: string | null;
    recorded_from: string | null;
    recorded_to: string | null;
  },
  validAt?: string,
  asOf?: string
): boolean {
  const now = new Date().toISOString();
  const vTarget = validAt ? new Date(validAt).getTime() : new Date(now).getTime();
  const rTarget = asOf ? new Date(asOf).getTime() : new Date(now).getTime();

  // Validate Valid Timeline
  if (record.valid_from) {
    const fromTime = new Date(record.valid_from).getTime();
    if (vTarget < fromTime) return false;
  }
  if (record.valid_to) {
    const toTime = new Date(record.valid_to).getTime();
    if (vTarget > toTime) return false;
  }

  // Validate System Timeline (Recorded Time)
  if (record.recorded_from) {
    const fromTime = new Date(record.recorded_from).getTime();
    if (rTarget < fromTime) return false;
  }
  if (record.recorded_to) {
    const toTime = new Date(record.recorded_to).getTime();
    if (rTarget > toTime) return false;
  }

  return true;
}
