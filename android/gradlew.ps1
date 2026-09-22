param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs
)

$java = (Get-Command java -ErrorAction Stop).Source
Push-Location $PSScriptRoot
try {
    & $java "-Dorg.gradle.appname=gradlew" -jar ".\gradle\wrapper\gradle-wrapper.jar" @GradleArgs
} finally {
    Pop-Location
}
exit $LASTEXITCODE
