# Register the daily box pipeline as a Windows scheduled task (feeds plan P4).
# NOT run by the pipeline itself: the operator runs this once, after review.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File register_task.ps1 [-At 10:00] [-Unregister]
#
# The task runs scripts\daily\run_daily.cmd FROM THE DEDICATED TREE (C:\Users\jcdav\wt\hoops-daily),
# which run_daily.ps1 resets to origin/master before each run. Until that tree exists, the task
# points at this checkout's copy of run_daily.cmd, which creates the tree on its first run.
#
# Settings: daily at -At (local), wakes the box, starts late if the box was off, never two at once,
# killed after 2 h. Runs as the logged-on user (git push and gh use that user's credentials).
param(
    [string]$At = "10:00",
    [string]$Name = "Hoops Daily Pipeline",
    [string]$Tree = "C:\Users\jcdav\wt\hoops-daily",
    [switch]$Unregister
)
$ErrorActionPreference = "Stop"
if ($Unregister) {
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    Write-Output "unregistered '$Name'"
    exit 0
}
$cmd = Join-Path $Tree "scripts\daily\run_daily.cmd"
if (-not (Test-Path $cmd)) { $cmd = Join-Path $PSScriptRoot "run_daily.cmd" }
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument ('/c "' + $cmd + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "vector-hoops daily data: cdn.nba.com box scores + play-by-play, replays, Map Hunt window, status; opens a data PR (feeds plan P4)" -Force | Out-Null
Write-Output "registered '$Name': daily at $At -> $cmd"
Write-Output "check: Get-ScheduledTaskInfo -TaskName '$Name'   run now: Start-ScheduledTask -TaskName '$Name'"
