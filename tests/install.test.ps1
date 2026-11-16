param([Parameter(Mandatory)][string]$ArchivePath)

$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot '../install.ps1'
$root = Join-Path ([IO.Path]::GetTempPath()) ('cuesprig-test-' + [guid]::NewGuid().ToString('N'))
$destination = Join-Path $root 'extension with spaces'
New-Item -ItemType Directory -Path $root | Out-Null
try {
    & $installer -ArchivePath $ArchivePath -InstallDirectory $destination -NoLaunch
    $manifest = Join-Path $destination 'manifest.json'
    $original = Get-Content -LiteralPath $manifest -Raw
    if (($original | ConvertFrom-Json).name -ne 'Cuesprig') { throw 'Fresh install failed.' }

    $stale = Join-Path $destination 'obsolete.js'
    Set-Content -LiteralPath $stale -Value 'Old release file'
    & $installer -ArchivePath $ArchivePath -InstallDirectory $destination -NoLaunch
    if (Test-Path -LiteralPath $stale) { throw 'Update left stale files.' }

    $corrupt = Join-Path $root 'invalid.zip'
    Set-Content -LiteralPath $corrupt -Value 'Invalid archive'
    Copy-Item -LiteralPath "$ArchivePath.sha256" -Destination "$corrupt.sha256"
    $rejected = $false
    try { & $installer -ArchivePath $corrupt -InstallDirectory $destination -NoLaunch }
    catch {
        if ($_.Exception.Message -notmatch 'checksum verification') { throw }
        $rejected = $true
    }
    if (-not $rejected -or (Get-Content -LiteralPath $manifest -Raw) -ne $original) {
        throw 'A failed update must preserve the installed files.'
    }
    if (Get-ChildItem -LiteralPath $root -Filter '.cuesprig-setup-*' -Force) { throw 'Installer left staging files.' }

    $savedLocalAppData = $env:LOCALAPPDATA
    try {
        $env:LOCALAPPDATA = $root
        $chrome = Join-Path $root 'Google\Chrome\Application\chrome.exe'
        $data = Join-Path $root 'Google\Chrome\User Data'
        New-Item -ItemType Directory -Path (Split-Path -Parent $chrome), $data -Force | Out-Null
        New-Item -ItemType File -Path $chrome | Out-Null
        Set-Content -LiteralPath (Join-Path $data 'Local State') -Value @'
{"profile":{"info_cache":{"Default":{"name":"Personal"},"Profile 2":{"name":"Studio"}}}}
'@
        function Set-Clipboard { param($Value) }
        function Start-Process {
            param($FilePath, $ArgumentList)
            if ($FilePath -ne $chrome -or $ArgumentList -ne '--profile-directory="Profile 2" chrome://extensions') {
                throw 'Setup attempted to launch a different Chrome profile.'
            }
            Set-Content -LiteralPath (Join-Path $root 'launch-verified') -Value $ArgumentList
        }
        & $installer -ArchivePath $ArchivePath -InstallDirectory $destination -ChromeProfile Studio
        if (-not (Test-Path -LiteralPath (Join-Path $root 'launch-verified'))) {
            throw 'Setup did not launch the selected Chrome profile.'
        }
    } finally { $env:LOCALAPPDATA = $savedLocalAppData }
    Write-Host 'Passed: fresh install, stable-path update, and corrupt archive rejection.'
} finally {
    $cleanup = (Resolve-Path -LiteralPath $root).ProviderPath
    if ($cleanup -eq $root -and (Split-Path -Leaf $cleanup) -like 'cuesprig-test-*') {
        Remove-Item -LiteralPath $cleanup -Recurse -Force
    }
}
