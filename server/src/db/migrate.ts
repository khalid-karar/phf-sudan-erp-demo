import { join } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb, createPool } from './client'

/** Applies pending migrations. Used on deploy: `npm run db:migrate`. */
export async function runMigrations(url: string) {
  const pool = createPool(url)
  try {
    await migrate(createDb(pool), { migrationsFolder: join(__dirname, '..', '..', 'migrations') })
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  runMigrations(url)
    .then(() => console.log('Migrations applied'))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
