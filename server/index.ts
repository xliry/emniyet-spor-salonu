import { buildApp } from './app.js'
import { config } from './config.js'

const app = await buildApp()
const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutdown requested')
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
await app.listen({ host: '0.0.0.0', port: config.PORT })

