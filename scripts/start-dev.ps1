$ErrorActionPreference = "Stop"

if (-not $env:SEC_USER_AGENT) {
  $env:SEC_USER_AGENT = "Zapi Dev dev@zapi.local"
}

if (-not $env:ZAPI_SERVICE_KEYS) {
  $env:ZAPI_SERVICE_KEYS = '{"zapi-local-test":{"subject":"local-tester","plan":"scale","displayName":"Local Tester"}}'
}

Write-Host "Starting Zapi dev server"
Write-Host "SEC_USER_AGENT=$env:SEC_USER_AGENT"
Write-Host "Test API key: zapi-local-test"

npm run dev
