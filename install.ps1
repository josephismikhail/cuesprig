[CmdletBinding()]
param(
    [string]$ArchivePath,
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Cuesprig\extension'),
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$version = $null
$chrome = $null
if (-not $NoLaunch) {
    $chrome = @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)}) |
        Where-Object { $_ } |
        ForEach-Object { Join-Path $_ 'Google\Chrome\Application\chrome.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if (-not $chrome) { throw 'Install Google Chrome, then run this command again.' }
}

$destination = [IO.Path]::GetFullPath($InstallDirectory)
$parent = Split-Path -Parent $destination
if (-not $parent) { throw 'Choose a folder inside a drive for Cuesprig.' }
$updating = Test-Path -LiteralPath $destination
if ($updating) {
    $item = Get-Item -LiteralPath $destination
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Choose a regular directory for Cuesprig.'
    }
    $current = Get-Content -LiteralPath (Join-Path $destination 'manifest.json') -Raw | ConvertFrom-Json
    if ($current.name -ne 'Cuesprig') { throw 'The install folder belongs to another extension.' }
}

New-Item -ItemType Directory -Path $parent -Force | Out-Null
$scratch = Join-Path $parent ('.cuesprig-setup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$previous = Join-Path $scratch 'previous'
try {
    if (-not $ArchivePath) {
        Write-Host 'Downloading the latest Cuesprig release...'
        $repository = 'josephismikhail/cuesprig'
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest"
        if ($release.tag_name -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Unexpected release version.' }
        $version = $release.tag_name.Substring(1)
        $name = "cuesprig-chrome-$version.zip"
        $url = "https://github.com/$repository/releases/download/$($release.tag_name)/$name"
        $ArchivePath = Join-Path $scratch $name
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $ArchivePath
        Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256" -OutFile "$ArchivePath.sha256"
    }

    $checksum = (Get-Content -LiteralPath "$ArchivePath.sha256" -Raw).Trim() -split '\s+'
    if ($checksum[0] -notmatch '^[a-fA-F0-9]{64}$' -or
        (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash -ne $checksum[0]) {
        throw 'The release ZIP failed its checksum verification.'
    }

    $staging = Join-Path $scratch 'extension'
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $staging
    $manifest = Get-Content -LiteralPath (Join-Path $staging 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.name -ne 'Cuesprig' -or $manifest.manifest_version -ne 3 -or
        ($version -and $manifest.version -ne $version) -or
        -not (Test-Path -LiteralPath (Join-Path $staging 'app\index.html') -PathType Leaf)) {
        throw 'The ZIP does not contain the expected Cuesprig extension.'
    }

    if ($updating) { [IO.Directory]::Move($destination, $previous) }
    try { [IO.Directory]::Move($staging, $destination) }
    catch {
        if ($updating) { [IO.Directory]::Move($previous, $destination) }
        throw
    }
} finally {
    # Keep the old files available if rollback itself failed.
    if ((Test-Path -LiteralPath $scratch) -and
        ((Test-Path -LiteralPath $destination) -or -not (Test-Path -LiteralPath $previous))) {
        $cleanup = (Resolve-Path -LiteralPath $scratch).ProviderPath
        if ($cleanup -eq $scratch -and (Split-Path -Parent $cleanup) -eq $parent) {
            Remove-Item -LiteralPath $cleanup -Recurse -Force
        }
    }
}

Write-Host "Cuesprig $($manifest.version) is ready at $destination"
if (-not $NoLaunch) {
    try { Set-Clipboard -Value $destination }
    catch { Write-Host "Copy this folder path: $destination" }
    Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions'
    if ($updating) {
        Write-Host 'If Cuesprig is already loaded from this folder, click Reload on its card.'
    }
    Write-Host 'First time? Turn on Developer mode, click Load unpacked, paste the folder path, and select the folder.'
    Write-Host 'Cuesprig opens its welcome screen on first load.'
}
