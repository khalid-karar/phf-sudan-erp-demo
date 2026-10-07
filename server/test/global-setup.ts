import { runMigrations } from '../src/db/migrate'

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test'

export default async function setup() {
  await runMigrations(TEST_DB)
}
