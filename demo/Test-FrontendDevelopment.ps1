[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$taskFrontendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskWorkspaceRoot = [IO.Path]::GetFullPath((Join-Path $taskFrontendRoot '..'))
$taskHelper = Join-Path $PSScriptRoot 'Stop-FrontendDevelopment.ps1'
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskReportPath = Join-Path $taskFrontendRoot 'docs\local-demo\verification\frontend-development.json'
$taskReport = [ordered]@{
    completed = $false; restored = $false; date = [DateTime]::UtcNow.ToString('o')
    scope = 'Development startup, anonymous rendering, compiled loopback configuration and Windows process lifecycle only; no authenticated development workflows tested.'
    command = 'pwsh -File Frontend/demo/Test-FrontendDevelopment.ps1'
    checks = @(); lifecycle = [ordered]@{ ownedDevelopmentStopped = $false; foreignListenerRejectedWithoutStopping = $false; freePortNoop = $false; containerFrontendRestored = $false }
    priorDiscovery = 'PTY Ctrl+C left the verified development child listening; the first restore failed on port3100. Exact verified parent stop subsequently released its child. No broad Node termination occurred.'
}
$taskDevProcess = $null; $taskForeignProcess = $null
$taskDevStartTime = $null; $taskDevCreationTime = $null
$taskForeignFile = Join-Path $PSScriptRoot 'results-development-foreign.local.cjs'
$taskGeneratedFiles = @('AGENTS.md', 'CLAUDE.md') | Where-Object { !(Test-Path -LiteralPath (Join-Path $taskFrontendRoot $_)) }
$taskEnvironmentNames = @('NEXT_PUBLIC_IDENTITY_API', 'NEXT_PUBLIC_MUSIC_API', 'NEXT_PUBLIC_USER_API')
$taskOriginalEnvironment = @{}
foreach ($taskName in $taskEnvironmentNames) { $taskOriginalEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process') }

function Assert-DevelopmentCheck([string]$Name, [bool]$Passed) {
    $taskReport.checks += [ordered]@{ name = $Name; passed = $Passed }
    if (!$Passed) { throw ('Development regression failed: ' + $Name) }
}
function Get-ScopedListener {
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 3100 })
}
function Wait-ScopedListener([int]$ExpectedProcess = 0) {
    $taskDeadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $taskFound = @(Get-ScopedListener)
        if ($taskFound.Count -eq 1 -and (!$ExpectedProcess -or $taskFound[0].OwningProcess -eq $ExpectedProcess)) { return }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $taskDeadline)
    throw 'Expected loopback development fixture listener did not start within30 seconds.'
}
function Invoke-ScopedCompose([string[]]$Arguments) {
    & docker compose --project-name spotibuds-local-demo --env-file (Join-Path $PSScriptRoot '.env.localdemo') -f (Join-Path $PSScriptRoot 'compose.yml') @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Named local-demo frontend compose operation failed.' }
}
function Read-HelperResult {
    $taskOutput = & pwsh -NoProfile -File $taskHelper
    if ($LASTEXITCODE -ne 0) { throw 'Verified development-stop helper failed.' }
    return ($taskOutput | ConvertFrom-Json)
}
function Read-LaunchedDevelopmentHelperResult {
    $taskDevProcess.Refresh()
    $taskParent = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskDevProcess.Id) -ErrorAction Stop
    $taskListeners = @(Get-ScopedListener)
    if ($taskDevProcess.HasExited -or !$taskParent -or !$taskDevCreationTime -or
        $taskDevProcess.StartTime.ToUniversalTime() -ne $taskDevStartTime -or
        $taskParent.CreationDate -ne $taskDevCreationTime -or $taskListeners.Count -ne 1 -or
        $taskListeners[0].LocalAddress -ne '127.0.0.1') { throw 'Launched development parent/listener ownership is uncertain; refusing cleanup.' }
    $taskChild = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskListeners[0].OwningProcess) -ErrorAction Stop
    if (!$taskChild -or $taskChild.ParentProcessId -ne $taskDevProcess.Id) { throw 'Listener does not belong to the development process launched by this test; refusing cleanup.' }
    $taskOutput = & pwsh -NoProfile -File $taskHelper -ExpectedParentProcessId $taskDevProcess.Id -ExpectedParentCreationTime $taskDevCreationTime.ToString('o')
    if ($LASTEXITCODE -ne 0) { throw 'Launched development-stop helper failed its ownership guard.' }
    return ($taskOutput | ConvertFrom-Json)
}

Push-Location $taskWorkspaceRoot
try {
    Invoke-ScopedCompose -Arguments @('stop', 'frontend')
    Assert-DevelopmentCheck 'Only the named frontend container is stopped before development startup' (@(Get-ScopedListener).Count -eq 0)
    [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_IDENTITY_API', 'http://127.0.0.1:5101', 'Process')
    [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_MUSIC_API', 'http://127.0.0.1:5102', 'Process')
    [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_USER_API', 'http://127.0.0.1:5103', 'Process')
    $taskNextCli = Join-Path $taskFrontendRoot 'node_modules\next\dist\bin\next'
    $taskDevProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskNextCli + '" dev --hostname 127.0.0.1 --port 3100') -WorkingDirectory $taskFrontendRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'results-development-stdout.local.log') -RedirectStandardError (Join-Path $PSScriptRoot 'results-development-stderr.local.log')
    $taskDevStartTime = $taskDevProcess.StartTime.ToUniversalTime()
    $taskLaunchedParent = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskDevProcess.Id) -ErrorAction Stop
    if (!$taskLaunchedParent -or [Math]::Abs(($taskLaunchedParent.CreationDate.ToUniversalTime() - $taskDevStartTime).TotalMilliseconds) -gt 1) { throw 'Cannot establish the exact launched development parent creation time.' }
    $taskDevCreationTime = $taskLaunchedParent.CreationDate
    Wait-ScopedListener
    Push-Location $taskFrontendRoot
    try {
        & node (Join-Path $PSScriptRoot 'verify-development-page.cjs')
        if ($LASTEXITCODE -ne 0) { throw 'Development anonymous rendering/config check failed.' }
        $taskPageProof = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'results-development-page.local.json') | ConvertFrom-Json
        foreach ($taskCheck in $taskPageProof.checks) { Assert-DevelopmentCheck $taskCheck.name $taskCheck.passed }
    } finally { Pop-Location }
    $taskOwned = Read-LaunchedDevelopmentHelperResult
    Assert-DevelopmentCheck 'Stopped child belongs to the exact test-launched parent and creation time' ($taskOwned.parentProcessId -eq $taskDevProcess.Id)
    Assert-DevelopmentCheck 'Verified workspace Next child is stopped and releases3100' ($taskOwned.stopped -and $taskOwned.ownershipVerified -and $taskOwned.portFree)
    Assert-DevelopmentCheck 'The launched Next development parent exits after its child stops' ($taskDevProcess.WaitForExit(5000))
    $taskReport.lifecycle.ownedDevelopmentStopped = $true

    Set-Content -LiteralPath $taskForeignFile -Value "require('http').createServer((request,response)=>response.end('development guard fixture')).listen(3100,'127.0.0.1');" -Encoding utf8
    $taskForeignProcess = Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskForeignFile + '"') -WorkingDirectory $taskFrontendRoot -WindowStyle Hidden -PassThru
    Wait-ScopedListener $taskForeignProcess.Id
    $taskForeignDenial = & pwsh -NoProfile -File $taskHelper 2>&1
    $taskDeniedCode = $LASTEXITCODE
    $taskForeignProcess.Refresh()
    $taskForeignAlive = !$taskForeignProcess.HasExited
    $taskForeignListener = @(Get-ScopedListener)
    Assert-DevelopmentCheck 'Foreign fixture is rejected without stopping its exact process' ($taskDeniedCode -ne 0 -and $taskForeignAlive -and $taskForeignListener.Count -eq 1 -and $taskForeignListener[0].OwningProcess -eq $taskForeignProcess.Id)
    $taskReport.lifecycle.foreignListenerRejectedWithoutStopping = $true
    $taskFixture = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskForeignProcess.Id) -ErrorAction Stop
    if (!$taskFixture -or $taskFixture.Name -ne 'node.exe' -or !$taskFixture.CommandLine.Contains($taskForeignFile)) { throw 'Foreign fixture PID ownership changed; refusing cleanup.' }
    Stop-Process -Id $taskForeignProcess.Id -ErrorAction Stop
    $taskForeignProcess.WaitForExit(5000) | Out-Null
    $taskForeignProcess = $null
    $taskFree = Read-HelperResult
    Assert-DevelopmentCheck 'Actual free port produces an idempotent no-op' (!$taskFree.stopped -and $taskFree.portFree)
    $taskReport.lifecycle.freePortNoop = $true
    $taskReport.completed = $true
} finally {
    $taskCleanupErrors = @()
    try {
        if ($taskForeignProcess) {
            $taskFixture = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskForeignProcess.Id) -ErrorAction Stop
            if ($taskFixture) {
                if ($taskFixture.Name -ne 'node.exe' -or !$taskFixture.CommandLine.Contains($taskForeignFile)) { throw 'Uncertain foreign fixture ownership; refusing cleanup.' }
                Stop-Process -Id $taskForeignProcess.Id -ErrorAction Stop
            }
        }
    } catch { $taskCleanupErrors += 'Foreign fixture cleanup refused or failed.' }
    try {
        if ($taskDevProcess) { $taskDevProcess.Refresh(); if (!$taskDevProcess.HasExited) { $null = Read-LaunchedDevelopmentHelperResult } }
    } catch { $taskCleanupErrors += 'Verified development process cleanup refused or failed.' }
    try {
        foreach ($taskGeneratedName in $taskGeneratedFiles) {
            $taskGeneratedPath = Join-Path $taskFrontendRoot $taskGeneratedName
            if (Test-Path -LiteralPath $taskGeneratedPath) {
                $taskGeneratedText = (Get-Content -Raw -LiteralPath $taskGeneratedPath).Trim()
                if (($taskGeneratedName -eq 'AGENTS.md' -and $taskGeneratedText.StartsWith('<!-- BEGIN:nextjs-agent-rules -->')) -or ($taskGeneratedName -eq 'CLAUDE.md' -and $taskGeneratedText -ceq '@AGENTS.md')) { Remove-Item -LiteralPath $taskGeneratedPath }
            }
        }
        if (Test-Path -LiteralPath $taskForeignFile) { Remove-Item -LiteralPath $taskForeignFile }
    } catch { $taskCleanupErrors += 'Generated temporary file cleanup failed.' }
    try {
        foreach ($taskName in $taskEnvironmentNames) { [Environment]::SetEnvironmentVariable($taskName, $taskOriginalEnvironment[$taskName], 'Process') }
    } catch { $taskCleanupErrors += 'Original process environment restoration failed.' }
    try {
        & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Demo.ps1') -Action start
        if ($LASTEXITCODE -ne 0) { throw 'Documented container restore failed.' }
        foreach ($taskPort in @(5101,5102,5103)) { Assert-DevelopmentCheck ('API' + $taskPort + ' ready after container restore') ((Invoke-WebRequest -Uri ('http://127.0.0.1:' + $taskPort + '/health/ready') -TimeoutSec 5).StatusCode -eq 200) }
        $taskProduction = Invoke-WebRequest -Uri 'http://127.0.0.1:3100/' -TimeoutSec 10
        Assert-DevelopmentCheck 'Production frontend restored with production CSP' ($taskProduction.StatusCode -eq 200 -and !$taskProduction.Headers['Content-Security-Policy'].ToString().Contains("'unsafe-eval'"))
        $taskReport.restored = $true
        $taskReport.lifecycle.containerFrontendRestored = $true
    } catch { $taskCleanupErrors += 'Documented container restore or readiness verification failed.' }
    try {
        if ($taskCleanupErrors.Count) {
            $taskReport.completed = $false
            $taskReport.cleanupErrors = $taskCleanupErrors
            $taskReport.checks += [ordered]@{ name = 'Every bounded cleanup/restoration step succeeded'; passed = $false }
        }
    } finally {
        New-Item -ItemType Directory -Path (Split-Path -Parent $taskReportPath) -Force | Out-Null
        $taskReport | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskReportPath -Encoding utf8
        Pop-Location
    }
}
if (!$taskReport.completed -or !$taskReport.restored) { throw 'Development lifecycle verification is incomplete; inspect the sanitized report.' }
'Development lifecycle/config verified and local containers restored.'
