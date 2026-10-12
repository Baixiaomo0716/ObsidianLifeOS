$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPackage = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'dist/manifest.json') -Raw | ConvertFrom-Json
$taskVersions = Get-Content -LiteralPath (Join-Path $taskRoot 'versions.json') -Raw | ConvertFrom-Json
if ($taskPackage.version -ne $taskManifest.version -or $taskVersions.($taskManifest.version) -ne $taskManifest.minAppVersion -or $taskManifest.id -ne 'life-os') { throw 'Version or plugin identity mismatch' }
$taskName = 'life-os-' + $taskManifest.version + '-preview-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6)
$taskOutput = Join-Path $taskRoot ('releases/' + $taskName)
$taskStage = Join-Path $taskOutput 'staging'
$taskVerify = Join-Path $taskOutput 'verification'
New-Item -ItemType Directory -Path (Join-Path $taskStage 'life-os') -Force | Out-Null
$taskFiles = [ordered]@{
  'life-os/main.js' = 'dist/main.js'
  'life-os/manifest.json' = 'dist/manifest.json'
  'life-os/styles.css' = 'dist/styles.css'
  'INSTALL.md' = 'docs/install-and-use.md'
  'CHANGELOG.md' = 'CHANGELOG.md'
  'ACCEPTANCE.md' = 'docs/qa/P1-acceptance.md'
  'THIRD-PARTY-NOTICES.txt' = 'docs/third-party-notices.txt'
  'docs/performance.md' = 'docs/performance.md'
  'docs/backup-and-migration.md' = 'docs/backup-and-migration.md'
  'docs/qa/P1-integration.md' = 'docs/qa/P1-integration.md'
  'docs/qa/P1-mobile.md' = 'docs/qa/P1-mobile.md'
  'docs/qa/sync-and-restore.md' = 'docs/qa/sync-and-restore.md'
}
$taskRows = @()
foreach ($taskEntry in $taskFiles.GetEnumerator()) {
  $taskSource = Join-Path $taskRoot $taskEntry.Value
  $taskTarget = Join-Path $taskStage $taskEntry.Key
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskTarget)) -Force | Out-Null
  Copy-Item -LiteralPath $taskSource -Destination $taskTarget
  $taskRows += [ordered]@{ path = $taskEntry.Key; bytes = (Get-Item -LiteralPath $taskTarget).Length; sha256 = (Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$taskChecksums = [ordered]@{ version = $taskManifest.version; minimumAppVersion = $taskManifest.minAppVersion; delivery = 'development-preview'; fullAcceptancePassed = $false; files = $taskRows }
[IO.File]::WriteAllText((Join-Path $taskStage 'CHECKSUMS.json'), ($taskChecksums | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$taskArchive = Join-Path $taskOutput ($taskName + '.zip')
Compress-Archive -Path (Join-Path $taskStage '*') -DestinationPath $taskArchive -CompressionLevel Optimal
Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskVerify
$taskActual = @(Get-ChildItem -LiteralPath $taskVerify -File -Recurse | ForEach-Object { $_.FullName.Substring($taskVerify.Length + 1).Replace('\','/') } | Sort-Object)
$taskExpected = @(@($taskFiles.Keys) + @('CHECKSUMS.json') | Sort-Object)
if (@(Compare-Object $taskActual $taskExpected).Count -ne 0) { throw 'Unexpected archive contents' }
foreach ($taskRow in $taskRows) {
  $taskRestored = Join-Path $taskVerify $taskRow.path
  if ((Get-Item -LiteralPath $taskRestored).Length -ne $taskRow.bytes -or (Get-FileHash -LiteralPath $taskRestored).Hash.ToLowerInvariant() -ne $taskRow.sha256) { throw ('Archive hash mismatch: ' + $taskRow.path) }
}
if ((Get-FileHash -LiteralPath (Join-Path $taskStage 'CHECKSUMS.json')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $taskVerify 'CHECKSUMS.json')).Hash) { throw 'Checksums file changed in archive' }
$taskReceipt = [ordered]@{ archive = $taskArchive; sha256 = (Get-FileHash -LiteralPath $taskArchive).Hash.ToLowerInvariant(); files = $taskActual.Count; version = $taskManifest.version; fullAcceptancePassed = $false; verifiedExtraction = $true; generatedAt = (Get-Date).ToUniversalTime().ToString('o') }
[IO.File]::WriteAllText((Join-Path $taskOutput 'package-report.json'), ($taskReceipt | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
$taskReceipt | ConvertTo-Json -Depth 4
