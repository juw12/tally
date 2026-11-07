param([string]$Label = "run")
# Runs every rubric-v1 gate and writes one log per suite to _check\logs-<label>\
$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = "utf-8"
$py = "C:\Users\juwen_lie\AppData\Local\Programs\Python\Python313\python.exe"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs = Join-Path $here "logs-$Label"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Set-Location $here

$suites = @(
    @{ name = "audit_all";   args = @("audit_all.py", $Label) },
    @{ name = "gates_extra"; args = @("gates_extra.py") },
    @{ name = "shoot";       args = @("shoot.py") },
    @{ name = "shoot_share"; args = @("shoot_share.py") },
    @{ name = "gates_round2"; args = @("gates_round2.py") },
    @{ name = "gates_round3"; args = @("gates_round3.py") },
    @{ name = "gates_round4"; args = @("gates_round4.py") },
    @{ name = "gates_round5"; args = @("gates_round5.py") },
    @{ name = "capture";     args = @("capture.py", $Label) }
)
foreach ($suite in $suites) {
    $log = Join-Path $logs "$($suite.name).log"
    & $py @($suite.args) *> $log
    "$($suite.name): exit $LASTEXITCODE"
}
"DONE"
