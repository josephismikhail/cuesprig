[CmdletBinding()]
param(
    [string]$ArchivePath,
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Cuesprig\extension'),
    [string]$ChromeProfile,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

function Select-ChromeProfile {
    param([object[]]$Profiles)
    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object Windows.Forms.Form
    $form.Text = 'Set up Cuesprig'
    $form.ClientSize = New-Object Drawing.Size(400, 158)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.AutoScaleMode = 'Dpi'

    $label = New-Object Windows.Forms.Label
    $label.Text = 'Choose the Chrome profile for Cuesprig.'
    $label.SetBounds(16, 18, 368, 24)
    $picker = New-Object Windows.Forms.ComboBox
    $picker.DropDownStyle = 'DropDownList'
    $picker.DisplayMember = 'Label'
    $picker.SetBounds(16, 54, 368, 28)
    foreach ($profile in $Profiles) { [void]$picker.Items.Add($profile) }

    $continue = New-Object Windows.Forms.Button
    $continue.Text = 'Continue'
    $continue.SetBounds(288, 108, 96, 32)
    $continue.DialogResult = 'OK'
    $continue.Enabled = $false
    $picker.Add_SelectedIndexChanged({ $continue.Enabled = $picker.SelectedIndex -ge 0 })
    $cancel = New-Object Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.SetBounds(184, 108, 96, 32)
    $cancel.DialogResult = 'Cancel'
    $form.AcceptButton = $continue
    $form.CancelButton = $cancel
    $form.Controls.AddRange(@($label, $picker, $continue, $cancel))
    try {
        if ($form.ShowDialog() -eq 'OK' -and $picker.SelectedItem) {
            return $picker.SelectedItem.Directory
        }
    } finally { $form.Dispose() }
}

$version = $null
$chrome = $null
if (-not $NoLaunch) {
    $chrome = @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)}) |
        Where-Object { $_ } |
        ForEach-Object { Join-Path $_ 'Google\Chrome\Application\chrome.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if (-not $chrome) { throw 'Install Google Chrome, then run this command again.' }

    $chromeData = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
    $state = Join-Path $chromeData 'Local State'
    if (-not (Test-Path -LiteralPath $state -PathType Leaf)) {
        throw 'Open Chrome and create a profile, then run setup again.'
    }
    $profiles = @((Get-Content -LiteralPath $state -Raw | ConvertFrom-Json).profile.info_cache.PSObject.Properties |
        Where-Object { $_.Name -match '^(Default|Profile [0-9]+)$' } |
        ForEach-Object {
            [pscustomobject]@{ Directory = $_.Name; Name = [string]$_.Value.name; Label = "$($_.Value.name) ($($_.Name))" }
        } | Sort-Object Name, Directory)
    if (-not $profiles.Count) { throw 'No Chrome profiles found. Open Chrome and set up a profile first.' }
    if ($ChromeProfile) {
        $matchesForProfile = @($profiles | Where-Object { $_.Directory -eq $ChromeProfile -or $_.Name -eq $ChromeProfile })
        if ($matchesForProfile.Count -ne 1) { throw 'That Chrome profile is missing or ambiguous. Run setup without a profile name to choose one.' }
        $profileDirectory = $matchesForProfile[0].Directory
    } else {
        $profileDirectory = Select-ChromeProfile -Profiles $profiles
        if (-not $profileDirectory) { Write-Host 'Cuesprig setup canceled.'; return }
    }
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
    Start-Process -FilePath $chrome -ArgumentList "--profile-directory=`"$profileDirectory`" chrome://extensions"
    if ($updating) {
        Write-Host 'If Cuesprig is already loaded from this folder, click Reload on its card.'
    }
    Write-Host 'First time? Turn on Developer mode, click Load unpacked, paste the folder path, and select the folder.'
    Write-Host 'Cuesprig opens its welcome screen on first load.'
}
