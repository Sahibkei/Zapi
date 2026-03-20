$ErrorActionPreference = "Stop"

function Import-EnvFile {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      return
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not [string]::IsNullOrWhiteSpace($name) -and -not (Test-Path "Env:$name")) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

Import-EnvFile ".env.local"

if (-not $env:SEC_USER_AGENT) {
  $env:SEC_USER_AGENT = "Zapi Dev dev@zapi.local"
}

if (-not $env:PORT) {
  $env:PORT = "3001"
}

if (-not $env:ZAPI_SERVICE_KEYS) {
  $env:ZAPI_SERVICE_KEYS = '{"zapi-local-test":{"subject":"local-tester","plan":"scale","displayName":"Local Tester"}}'
}

Write-Host "Starting Zapi dev server"
Write-Host "PORT=$env:PORT"
Write-Host "SEC_USER_AGENT=$env:SEC_USER_AGENT"
if ($env:COMPANIES_HOUSE_API_KEY) {
  Write-Host "COMPANIES_HOUSE_API_KEY=loaded"
}
if ($env:EDINET_API_KEY) {
  Write-Host "EDINET_API_KEY=loaded"
}
Write-Host "Test API key: zapi-local-test"

npm run dev
