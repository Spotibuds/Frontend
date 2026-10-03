param()
$ErrorActionPreference = 'Stop'
$demoPath = $PSScriptRoot
$envPath = Join-Path $demoPath '.env.localdemo'
$accountPath = Join-Path $demoPath 'accounts.local.json'
if (Test-Path -LiteralPath $envPath) {
    if (-not (Test-Path -LiteralPath $accountPath)) { throw 'Existing local environment has no account credential file. Restore accounts.local.json before seeding; existing credentials were preserved.' }
    Write-Output 'Local environment already exists; credentials preserved.'; exit 0
}
function New-DemoSecret { param([int]$Length=32) $data = New-Object byte[] $Length; [System.Security.Cryptography.RandomNumberGenerator]::Fill($data); return [Convert]::ToBase64String($data) }
function New-DemoPassword { return 'Aa1!' + (New-DemoSecret 18).Replace('+','x').Replace('/','y').Replace('=','z') }
$adminPassword = New-DemoPassword
$accounts = @(
    @{ username='demoadmin'; email='admin@spotibuds.local'; password=$adminPassword; role='Admin' },
    @{ username='alice'; email='alice@spotibuds.local'; password=(New-DemoPassword); role='User' },
    @{ username='bob'; email='bob@spotibuds.local'; password=(New-DemoPassword); role='User' },
    @{ username='mallory'; email='mallory@spotibuds.local'; password=(New-DemoPassword); role='User' }
)
$settings = [ordered]@{
    COMPOSE_PROJECT_NAME='spotibuds-local-demo'; POSTGRES_PASSWORD=(New-DemoPassword); MONGO_PASSWORD=(New-DemoPassword);
    REDIS_PASSWORD=(New-DemoPassword); MONGO_REPLICA_KEY=(New-DemoSecret 48); AZURITE_KEY=(New-DemoSecret 64); JWT_SECRET=(New-DemoSecret 64); SERVICE_SECRET=(New-DemoSecret 48);
    ADMIN_USERNAME='demoadmin'; ADMIN_EMAIL='admin@spotibuds.local'; ADMIN_PASSWORD=$adminPassword
}
$lines = $settings.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }
$accounts | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $accountPath -Encoding utf8
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
Write-Output 'Generated fresh local credentials in ignored demo/.env.localdemo and demo/accounts.local.json.'
