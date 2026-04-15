param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/7] Desktop version guncelleniyor -> $Version"
npm version $Version --workspace @mescord/desktop --no-git-tag-version | Out-Host

Write-Host "[2/7] Uygulama build aliniyor"
npm run build:desktop | Out-Host

Write-Host "[3/7] Dosyalar git'e ekleniyor"
git add . | Out-Host

Write-Host "[4/7] Commit olusturuluyor"
git commit -m "release: desktop v$Version" | Out-Host

Write-Host "[5/7] Tag olusturuluyor"
git tag "v$Version" | Out-Host

Write-Host "[6/7] Branch push"
git push origin $Branch | Out-Host

Write-Host "[7/7] Tag push"
git push origin "v$Version" | Out-Host

Write-Host "Tamamlandi. GitHub Actions release workflow bu tag ile tetiklenecek."
