import { createApp } from './app'
import { env } from './config/env'

async function bootstrap() {
  const app = await createApp()
  await app.listen(env().PORT, '0.0.0.0')
  console.log(`PHF ERP API listening on :${env().PORT}`)
}

bootstrap().catch((e) => {
  console.error(e)
  process.exit(1)
})
