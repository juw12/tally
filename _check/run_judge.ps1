param(
    [string]$Prompt = "judge_pair_v2r2.md",
    [string]$Out = "judge_v2r2.txt",
    [string[]]$Images = @("sheet-v2r2.jpg", "sheet-v2base.jpg"),
    [int]$TimeoutSec = 240
)

$checkDir = $PSScriptRoot
Set-Location $checkDir
$promptText = Get-Content (Join-Path $checkDir $Prompt) -Raw
# -File passes "a.jpg,b.jpg" as one string, so split it here.
$imagePaths = $Images | ForEach-Object { $_ -split "," } | ForEach-Object { Join-Path $checkDir $_.Trim() }

$job = Start-Job -ScriptBlock {
    param($dir, $text, $paths)
    Set-Location $dir
    $exe = "C:\Users\juwen_lie\AppData\Local\PEGAAi Opencode\opencode.exe"
    $fileArgs = @()
    foreach ($path in $paths) {
        $fileArgs += "-f"
        $fileArgs += $path
    }
    & $exe run -m pegaai/Pega-Vision @fileArgs $text 2>&1
} -ArgumentList $checkDir, $promptText, $imagePaths

if (Wait-Job $job -Timeout $TimeoutSec) {
    Receive-Job $job | Out-File (Join-Path $checkDir $Out) -Encoding utf8
    "DONE"
} else {
    Stop-Job $job
    "TIMEOUT"
}
Remove-Job $job -Force
