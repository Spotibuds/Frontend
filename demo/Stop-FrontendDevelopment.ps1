[CmdletBinding()]
param(
    [int]$ExpectedParentProcessId = 0,
    [datetime]$ExpectedParentCreationTime = [datetime]::MinValue
)

$ErrorActionPreference = 'Stop'
$taskFrontendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskExpectedChild = Join-Path $taskFrontendRoot 'node_modules\next\dist\server\lib\start-server.js'
$taskExpectedParent = Join-Path $taskFrontendRoot 'node_modules\next\dist\bin\next'

function Get-DevelopmentListener {
    try {
        @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
            $_.LocalPort -eq 3100
        })
    } catch {
        throw 'Cannot inspect port3100 safely. Use a PowerShell session permitted to query local process/network ownership. No process was stopped.'
    }
}

function Confirm-DevelopmentPortFree {
    $taskProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 3100)
    try {
        $taskProbe.ExclusiveAddressUse = $true
        $taskProbe.Start()
    } catch {
        throw 'Port3100 could not be exclusively bound on127.0.0.1. Ownership or port availability is uncertain; no additional process was stopped.'
    } finally { $taskProbe.Stop() }
}

function Get-CommandArguments([string]$CommandLine) {
    @([regex]::Matches($CommandLine, '"([^"]*)"|(\S+)') | ForEach-Object {
        if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
    })
}

$taskListeners = @(Get-DevelopmentListener)
if ($taskListeners.Count -eq 0) {
    Confirm-DevelopmentPortFree
    [pscustomobject]@{ stopped = $false; portFree = $true; ownershipVerified = $false; reason = 'No listener on127.0.0.1:3100.' } | ConvertTo-Json -Compress
    exit 0
}
if ($taskListeners.Count -ne 1) { throw 'Port3100 ownership is ambiguous. No process was stopped.' }
if ($taskListeners[0].LocalAddress -ne '127.0.0.1') { throw 'Port3100 has a foreign wildcard/IPv6 listener. No process was stopped.' }
try {
    $taskChild = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskListeners[0].OwningProcess) -ErrorAction Stop
    $taskParent = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskChild.ParentProcessId) -ErrorAction Stop
} catch { throw 'Cannot inspect development process ownership safely. No process was stopped.' }
if (!$taskChild -or !$taskParent -or $taskChild.Name -ne 'node.exe' -or $taskParent.Name -ne 'node.exe') {
    throw 'Port3100 is not owned by this workspace Next development process and its parent. No process was stopped.'
}
if ($ExpectedParentProcessId -and ($taskParent.ProcessId -ne $ExpectedParentProcessId -or
    $ExpectedParentCreationTime -eq [datetime]::MinValue -or $taskParent.CreationDate -ne $ExpectedParentCreationTime)) {
    throw 'The listener does not belong to the exact development parent created by this test. No process was stopped.'
}
$taskChildArgs = @(Get-CommandArguments $taskChild.CommandLine)
$taskParentArgs = @(Get-CommandArguments $taskParent.CommandLine)
if ($taskChildArgs.Count -ne 2 -or $taskParentArgs.Count -ne 7) { throw 'Unexpected development command. No process was stopped.' }
try {
    $taskChildPath = [IO.Path]::GetFullPath($taskChildArgs[1])
    $taskParentPath = [IO.Path]::GetFullPath($taskParentArgs[1])
} catch { throw 'Cannot resolve development command paths safely. No process was stopped.' }
if ($taskChildPath -ine $taskExpectedChild -or $taskParentPath -ine $taskExpectedParent -or
    ($taskParentArgs[2..6] -join ' ') -cne 'dev --hostname 127.0.0.1 --port 3100' -or
    $taskChild.ExecutablePath -ine $taskParent.ExecutablePath) {
    throw 'Port3100 command paths or arguments do not match this workspace explicit Next dev command. No process was stopped.'
}

# Recheck the listener and process identities to reject exit/PID-reuse races.
$taskCurrentListeners = @(Get-DevelopmentListener)
$taskCurrentChild = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskChild.ProcessId) -ErrorAction Stop
$taskCurrentParent = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $taskParent.ProcessId) -ErrorAction Stop
if ($taskCurrentListeners.Count -ne 1 -or $taskCurrentListeners[0].OwningProcess -ne $taskChild.ProcessId -or
    !$taskCurrentChild -or !$taskCurrentParent -or
    $taskCurrentChild.CreationDate -ne $taskChild.CreationDate -or $taskCurrentParent.CreationDate -ne $taskParent.CreationDate -or
    $taskCurrentChild.CommandLine -cne $taskChild.CommandLine -or $taskCurrentParent.CommandLine -cne $taskParent.CommandLine) {
    throw 'Development ownership changed during inspection. No process was stopped.'
}
Stop-Process -Id $taskChild.ProcessId -ErrorAction Stop
$taskDeadline = [DateTime]::UtcNow.AddSeconds(5)
do {
    $taskRemaining = @(Get-DevelopmentListener)
    if ($taskRemaining.Count -eq 0) { break }
    if ($taskRemaining.Count -ne 1 -or $taskRemaining[0].OwningProcess -ne $taskChild.ProcessId) {
        throw 'Another process acquired port3100 after the verified development child stopped. No additional process was stopped.'
    }
    Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $taskDeadline)
if ($taskRemaining.Count -ne 0) { throw 'The verified development child did not release port3100 within five seconds. No additional process was stopped.' }
Confirm-DevelopmentPortFree
[pscustomobject]@{ stopped = $true; portFree = $true; ownershipVerified = $true; processId = $taskChild.ProcessId; parentProcessId = $taskParent.ProcessId } | ConvertTo-Json -Compress
