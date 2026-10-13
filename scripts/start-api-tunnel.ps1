param(
    [string]$NgrokPath = 'ngrok'
)

$ErrorActionPreference = 'Stop'

# Resolve the installed CLI without changing the global PATH or reading credentials.
$ngrokCommand = Get-Command $NgrokPath -ErrorAction SilentlyContinue
if (-not $ngrokCommand) {
    throw 'ngrok is not installed. Run: winget install ngrok -s msstore'
}

try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 5
} catch {
    throw 'Start the LOST QUEST backend on port 8080 before starting the tunnel.'
}
if ($health.status -ne 'OK' -or $health.service -ne 'LOST QUEST API') {
    throw 'Port 8080 did not return the expected LOST QUEST health response.'
}

Write-Host 'Keep this terminal open. Ctrl+C stops the public API tunnel.'
# The account-assigned development domain is reused. No token is passed by this script.
& $ngrokCommand.Source http http://127.0.0.1:8080
if ($LASTEXITCODE -ne 0) {
    throw 'ngrok exited with an error. Check its message and local account configuration.'
}
