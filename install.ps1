# speckit-sdd Installer — Windows PowerShell 5.1+
# Usage: irm https://raw.githubusercontent.com/<user>/speckit-sdd/main/install.ps1 | iex
# Or:    .\install.ps1

$Repo     = "<user>/speckit-sdd"
$Branch   = "main"
$ConfigDir = "$env:USERPROFILE\.config\opencode"
$TmpDir   = "$env:TEMP\speckit-sdd-install"

if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

Write-Host "==> Cloning speckit-sdd ($Branch)..."
git clone --depth 1 --branch $Branch "https://github.com/$Repo.git" "$TmpDir\speckit-sdd"

Write-Host "==> Installing templates..."
New-Item -ItemType Directory -Path "$ConfigDir\templates" -Force | Out-Null
Copy-Item -Recurse -Force "$TmpDir\speckit-sdd\templates\*" "$ConfigDir\templates\"

Write-Host "==> Installing skills..."
Get-ChildItem "$TmpDir\speckit-sdd\skills\*" -Directory | ForEach-Object {
    $skillName = $_.Name
    $target = "$ConfigDir\skills\$skillName"
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -Recurse -Force "$_\*" "$target"
}

Write-Host "==> Installing tools..."
New-Item -ItemType Directory -Path "$ConfigDir\tools" -Force | Out-Null
Copy-Item -Recurse -Force "$TmpDir\speckit-sdd\tools\*" "$ConfigDir\tools\"

Write-Host "==> Installing AGENTS.md..."
Copy-Item -Force "$TmpDir\speckit-sdd\AGENTS.md" "$ConfigDir\AGENTS.md"

Remove-Item -Recurse -Force $TmpDir

Write-Host ""
Write-Host "==> Done! speckit-sdd installed to $ConfigDir"
Write-Host "    Restart opencode to load new tools and skills."
Write-Host "    Run /status to verify."
