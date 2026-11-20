import { z } from "zod";

const RowSchema = z.object({
  service: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  model: z.enum(["on-demand", "reserved", "spot"]),
  qty: z.number().finite().min(0).max(1_000_000),
  units: z.number().finite().min(0).max(1_000_000),
  price: z.number().finite().min(0).max(1_000_000),
  discount: z.number().finite().min(0).max(100)
});

const InferenceSchema = z.object({
  gpuHourlyRate: z.number().finite().min(0).max(1_000_000),
  gpuCount: z.number().finite().min(0).max(1_000_000),
  gpuHoursPerMonth: z.number().finite().min(0).max(744),
  inputTokensPerMonth: z.number().finite().min(0).max(1_000_000_000_000),
  outputTokensPerMonth: z.number().finite().min(0).max(1_000_000_000_000),
  hostedInputPricePerMillion: z.number().finite().min(0).max(1_000_000),
  hostedOutputPricePerMillion: z.number().finite().min(0).max(1_000_000)
});

export const ScenarioSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  growthRate: z.number().finite().min(-10).max(25).default(4),
  monthlyBudget: z.number().finite().min(0).max(1_000_000_000).default(0),
  rows: z.array(RowSchema).max(500),
  // Optional so scenarios saved before the inference panel existed still load.
  inference: InferenceSchema.optional()
});

export const ScenarioPatchSchema = ScenarioSchema.partial().refine(
  (val) => Object.keys(val).length > 0,
  "Patch must include at least one field"
);

