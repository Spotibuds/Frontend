param([switch]$Browser, [switch]$BuildImages)
$ErrorActionPreference='Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$localSettings = @{}
Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env.localdemo') | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $localSettings[$Matches[1]]=$Matches[2] } }
$env:USER_TEST_MONGO = 'mongodb://demo:' + $localSettings.MONGO_PASSWORD + '@127.0.0.1:57017/?authSource=admin&directConnection=true'
$env:MUSIC_TEST_MONGO = $env:USER_TEST_MONGO
$env:MUSIC_TEST_STORAGE = 'DefaultEndpointsProtocol=http;AccountName=spotibudsdemo;AccountKey=' + $localSettings.AZURITE_KEY + ';BlobEndpoint=http://127.0.0.1:10000/spotibudsdemo;'
$env:NEXT_PUBLIC_IDENTITY_API = 'http://127.0.0.1:5101'
$env:NEXT_PUBLIC_MUSIC_API = 'http://127.0.0.1:5102'
$env:NEXT_PUBLIC_USER_API = 'http://127.0.0.1:5103'
function Run-Check { param([string]$Executable,[Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) & $Executable @Arguments; if ($LASTEXITCODE -ne 0) { throw "Check failed: $Executable $($Arguments -join ' ')" } }
function Audit-Backend {
    param([string]$Repository)
    $report = & dotnet list "$Repository/$Repository.csproj" package --vulnerable --include-transitive --format json --no-restore 2>&1
    if ($LASTEXITCODE -ne 0 -or ($report -join "`n") -match 'NU1900') { throw "Dependency audit unavailable for $Repository." }
    $parsed = ($report -join "`n") | ConvertFrom-Json
    $expectedProject = [IO.Path]::GetFullPath((Join-Path $workspace "$Repository/$Repository.csproj"))
    if ($parsed.version -ne 1 -or @($parsed.projects).Count -ne 1 -or -not $parsed.projects[0].path -or [IO.Path]::GetFullPath($parsed.projects[0].path) -ne $expectedProject) { throw "Incomplete dependency audit for $Repository." }
    function Assert-NoAuditErrors {
        param($Value)
        if ($null -eq $Value -or $Value -is [string] -or $Value -is [ValueType]) { return }
        if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [pscustomobject]) { foreach ($item in $Value) { Assert-NoAuditErrors $item }; return }
        foreach ($property in $Value.PSObject.Properties) {
            if ($property.Name -in @('problems','errors','error') -and $property.Value) { throw "Dependency audit reported errors for $Repository." }
            Assert-NoAuditErrors $property.Value
        }
    }
    Assert-NoAuditErrors $parsed
    foreach ($project in $parsed.projects) { foreach ($framework in $project.frameworks) { if ($framework.topLevelPackages -or $framework.transitivePackages) { throw "Vulnerable packages reported for $Repository." } } }
    Write-Output "$Repository dependency scan: zero known vulnerable packages."
}
Push-Location $workspace
try {
    foreach ($repository in @('Identity','Music','User')) {
        Run-Check dotnet @('restore',"$repository/tests/$repository.Tests/$repository.Tests.csproj",'--locked-mode')
        Run-Check dotnet @('build',"$repository/$repository.csproj",'-c','Release','--no-restore')
        Run-Check dotnet @('test',"$repository/tests/$repository.Tests/$repository.Tests.csproj",'-c','Release','--no-restore')
    }
    foreach ($repository in @('Identity','Music','User')) { Audit-Backend $repository }
    Push-Location Frontend
    try {
        foreach ($script in @('type-check','lint','format:check','test','build')) { Run-Check npm.cmd @('run',$script) }
        Run-Check npm.cmd @('run','audit:dependencies')
        if ($Browser) { Run-Check npm.cmd @('run','test:browser') }
    } finally { Pop-Location }
    Run-Check node @('Frontend/demo/identity-integration.mjs')
    if (Test-Path -LiteralPath Frontend/demo/user-integration.mjs) { Run-Check node @('Frontend/demo/user-integration.mjs') }
    if ($BuildImages) { Run-Check docker @('compose','--env-file','Frontend/demo/.env.localdemo','-f','Frontend/demo/compose.yml','build') }
} finally { Pop-Location }
