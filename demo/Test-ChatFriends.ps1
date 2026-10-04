param([string]$Filter = '', [string]$RunName = 'chat-friends')
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$localSettings = @{}
Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env.localdemo') | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $localSettings[$Matches[1]] = $Matches[2] } }
if (-not $localSettings.MONGO_PASSWORD) { throw 'Missing isolated demo Mongo credentials.' }
if (-not $localSettings.AZURITE_KEY) { throw 'Missing isolated demo Blob credentials.' }
if ($RunName -notmatch '^[a-z0-9-]+$') { throw 'Invalid test run name.' }
$previousMongo = $env:USER_TEST_MONGO
$previousStorage = $env:MUSIC_TEST_STORAGE
try {
    $env:USER_TEST_MONGO = 'mongodb://demo:' + $localSettings.MONGO_PASSWORD + '@127.0.0.1:57017/?authSource=admin&directConnection=true'
    $env:MUSIC_TEST_STORAGE = 'DefaultEndpointsProtocol=http;AccountName=spotibudsdemo;AccountKey=' + $localSettings.AZURITE_KEY + ';BlobEndpoint=http://127.0.0.1:10000/spotibudsdemo;'
    $arguments = @('test', (Join-Path $workspace 'User/tests/User.Tests/User.Tests.csproj'), '--configuration', 'Release', '--no-restore', '--logger', ('trx;LogFileName=' + $RunName + '.trx'), '--results-directory', (Join-Path $PSScriptRoot ('results-chat-friends/' + $RunName)))
    if ($Filter) { $arguments += @('--filter', $Filter) }
    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Chat/friend backend verification failed.' }
} finally {
    $env:USER_TEST_MONGO = $previousMongo
    $env:MUSIC_TEST_STORAGE = $previousStorage
}
