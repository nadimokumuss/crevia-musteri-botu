import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnvFile('.env.local')
loadEnvFile('.env')

const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL

if (!deployHookUrl) {
  process.stderr.write(
    'VERCEL_DEPLOY_HOOK_URL tanimli degil. .env.local veya shell env icine deploy hook URL ekleyin.\n'
  )
  process.exit(1)
}

try {
  const response = await fetch(deployHookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      trigger: 'local-script',
      requestedAt: new Date().toISOString(),
    }),
  })

  const rawBody = await response.text()

  if (!response.ok) {
    process.stderr.write(`Vercel deploy hook hatasi: ${response.status} ${response.statusText}\n`)
    if (rawBody) {
      process.stderr.write(`${rawBody}\n`)
    }
    process.exit(1)
  }

  process.stdout.write('Vercel deploy tetiklendi.\n')
  if (rawBody) {
    process.stdout.write(`${rawBody}\n`)
  }
} catch (error) {
  process.stderr.write(`Deploy hook cagrisi basarisiz: ${String(error)}\n`)
  process.exit(1)
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName)

  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}
