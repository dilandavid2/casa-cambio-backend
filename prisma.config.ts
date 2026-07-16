import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` only needs the schema, but Prisma loads this config during
// Railway's isolated build where runtime service variables may be unavailable.
// Migrations, seed and the running API still receive and require DATABASE_URL.
const buildTimeUrl =
  process.env.DATABASE_URL ??
  'postgresql://build:build@localhost:5432/build_placeholder';

export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  migrations: {
    path: 'src/prisma/migrations',
    seed: 'tsx src/prisma/seed.ts',
  },
  datasource: {
    url: buildTimeUrl,
  },
});
