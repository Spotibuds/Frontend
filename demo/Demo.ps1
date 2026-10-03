param([ValidateSet('start','stop','status','restart','seed','reset')][string]$Action='start',[switch]$DestroyDemoData)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$envPath=Join-Path $PSScriptRoot '.env.localdemo'
$composePath=Join-Path $PSScriptRoot 'compose.yml'
if (-not (Test-Path -LiteralPath $envPath)) { & (Join-Path $PSScriptRoot 'New-LocalEnvironment.ps1') }
if (-not (Select-String -LiteralPath $envPath -Pattern '^COMPOSE_PROJECT_NAME=spotibuds-local-demo$' -Quiet)) { throw 'Only the dedicated spotibuds-local-demo project can be operated by this script.' }
function Compose { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) & docker compose --project-name spotibuds-local-demo --env-file $envPath -f $composePath @Arguments; if ($LASTEXITCODE -ne 0) { throw "Demo compose failed for $($Arguments[0])." } }
Push-Location $workspace
try {
    switch ($Action) {
        start { Compose @('up','-d','--build'); & node (Join-Path $PSScriptRoot 'wait-ready.mjs'); if ($LASTEXITCODE -ne 0) { throw 'Demo readiness failed.' } }
        stop { Compose @('stop') }
        restart { Compose @('stop'); Compose @('up','-d'); & node (Join-Path $PSScriptRoot 'wait-ready.mjs'); if ($LASTEXITCODE -ne 0) { throw 'Demo readiness failed.' } }
        status { Compose @('ps'); & node (Join-Path $PSScriptRoot 'wait-ready.mjs') --once; if ($LASTEXITCODE -ne 0) { throw 'Demo readiness failed.' } }
        seed { & node (Join-Path $PSScriptRoot 'seed.mjs'); if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed.' } }
        reset { if (-not $DestroyDemoData) { throw 'Reset deletes only this named demo project volumes. Supply -DestroyDemoData explicitly.' }; Compose @('down','--volumes','--remove-orphans'); $fixture=Join-Path $PSScriptRoot 'fixtures.local.json'; if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture }; Write-Output 'Named disposable demo containers and volumes removed; generated credentials preserved.' }
    }
} finally { Pop-Location }
