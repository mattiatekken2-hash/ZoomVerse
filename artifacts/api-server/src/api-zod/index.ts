import { z } from "zod";

export const apiZod = {};

// Creiamo lo schema finto che si aspetta la rotta health
export const HealthCheckResponse = z.object({
  status: z.string(),
  timestamp: z.string(),
});
