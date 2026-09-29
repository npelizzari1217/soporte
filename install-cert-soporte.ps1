# install-cert-soporte.ps1 - Emite o renueva el certificado TLS de
# soporte.sesitec.net con win-acme (Let's Encrypt) sobre el sitio de IIS (VPS Windows).
# 100% ASCII (PS 5.1 lee .ps1 sin BOM como ANSI).
#
# Versionado el 2026-09-29 tal como corria en el VPS, donde vivia sin versionar:
# el cuerpo de abajo es el original, sin cambios. Si el VPS se perdia, el script
# se perdia con el (ya paso con rotate-admin-pw.ps1).
#
# Que hace:
#   1. Si no esta, baja la ultima release de win-acme (x64 pluggable) a
#      C:\tools\win-acme.
#   2. Corre wacs.exe contra el sitio de IIS con id 3, validacion por archivo en
#      C:\soporte\iis, y deja el certificado en el store de Windows.
#
# Supuestos que el script NO verifica (revisar antes de correrlo en otro server):
#   - El sitio de IIS de soporte tiene id 3.
#   - C:\soporte\iis es el webroot que IIS sirve para la validacion HTTP-01.
#   - Baja la ULTIMA release de win-acme, sin version fija ni checksum.
#
# Uso (administrator):
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-cert-soporte.ps1
#
# Ver DEPLOY-VPS-runbook.md, seccion "Scripts de operaciones sin pipeline".

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = 'C:\tools\win-acme'
New-Item -ItemType Directory -Force $dir | Out-Null

if (-not (Test-Path "$dir\wacs.exe")) {
  $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/win-acme/win-acme/releases/latest' -Headers @{ 'User-Agent' = 'pwsh' }
  $asset = $rel.assets | Where-Object { $_.name -like '*x64.pluggable.zip' } | Select-Object -First 1
  $zip = 'C:\tools\wacs.zip'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
  Expand-Archive -Force $zip $dir
  Write-Output ('DOWNLOADED: ' + $asset.name)
}

if (-not (Test-Path "$dir\wacs.exe")) { Write-Output 'WACS_NOT_FOUND'; exit 1 }

& "$dir\wacs.exe" --target iis --siteid 3 --host soporte.sesitec.net --validation filesystem --webroot C:\soporte\iis --installation iis --store certificatestore --emailaddress npelizzari@gmail.com --accepttos
Write-Output ('WACS_EXIT=' + $LASTEXITCODE)
