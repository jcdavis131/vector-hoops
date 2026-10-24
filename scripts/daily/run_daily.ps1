# Scheduled entry point for the daily box pipeline (feeds plan P4).
#
# Resets a DEDICATED worktree (never the main checkout) to origin/master, then runs
# scripts/daily/run_daily.py from that tree with --open-pr, so the code that runs is
# always reviewed master and each data PR branches from a fresh origin/master.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File run_daily.ps1 [-DryRun] [-Tree DIR] [-Python EXE]
#
# -DryRun runs steps a-e without --open-pr (nothing is committed or pushed).
# Logs: %USERPROFILE%\.hoops-daily\logs\ (run-*.log, requests-*.jsonl, wrapper-*.log).
param(
    [string]$Tree = "C:\Users\jcdav\wt\hoops-daily",
    [string]$Repo = "C:\Users\jcdav\vector-hoops",
    [string]$Python = "",
    [switch]$DryRun
)
$ErrorActionPreference = "Continue"
$home_dir = Join-Path $env:USERPROFILE ".hoops-daily"
New-Item -ItemType Directory -Force (Join-Path $home_dir "logs") | Out-Null
$wlog = Join-Path $home_dir ("logs\wrapper-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
function Say([string]$m) { $l = (Get-Date -Format "s") + " " + $m; $l | Out-File -Append -Encoding utf8 $wlog; Write-Output $l }

if (-not $Python) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { Say "no python on PATH; pass -Python"; exit 1 }
    $Python = $cmd.Source
}

if (-not (Test-Path (Join-Path $Tree ".git"))) {
    Say "creating worktree $Tree from origin/master (repo $Repo)"
    git -C $Repo fetch -q origin master
    git -C $Repo worktree add --detach $Tree origin/master
    if ($LASTEXITCODE -ne 0) { Say "worktree add failed ($LASTEXITCODE)"; exit 1 }
}
git -C $Tree fetch -q origin master
if ($LASTEXITCODE -ne 0) { Say "git fetch failed ($LASTEXITCODE)"; exit 1 }
# The tree is ours alone: discard yesterday's run (its data is on its PR branch).
git -C $Tree checkout -q -f --detach origin/master
git -C $Tree clean -fdq
if ($LASTEXITCODE -ne 0) { Say "reset to origin/master failed ($LASTEXITCODE)"; exit 1 }
Say ("tree at " + (git -C $Tree rev-parse --short HEAD))

$runArgs = @((Join-Path $Tree "scripts\daily\run_daily.py"), "--tree", $Tree)
if (-not $DryRun) { $runArgs += "--open-pr" }
Say ("run: $Python " + ($runArgs -join " "))
& $Python @runArgs
$rc = $LASTEXITCODE
Say "run_daily exit $rc"
exit $rc
