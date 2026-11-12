import { config as loadEnv } from 'dotenv';
loadEnv({path:new URL('../../.env',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')});
import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' }, datasource: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/nuttiew' } });
