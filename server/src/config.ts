import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});
export const config = schema.parse(process.env);
