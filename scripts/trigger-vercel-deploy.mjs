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
