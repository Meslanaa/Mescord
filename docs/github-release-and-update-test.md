# GitHub Upload + Update Popup Test Playbook

Bu rehber, Mescord desktop icin update popup akisini gercekten test etmek icin gereken adimlari verir.

## A) Su anki installer ile ilk kurulum

Kurulum icin dosya:

- releases/1.1.0-beta.1/Mescord-Setup-1.1.0-beta.1.exe

Kur:

1. Installer'i calistir.
2. Mescord'u ac, bir odaya giris yap.
3. Uygulamayi kapat.

## B) GitHub repository baglama

Eger remote henuz yoksa:

```bash
git remote add origin https://github.com/<kullanici>/<repo>.git
git branch -M main
git push -u origin main
```

## C) Ilk release publish (v1.1.0-beta.1)

```bash
git add .
git commit -m "chore: beta desktop baseline"
git tag v1.1.0-beta.1
git push origin main
git push origin v1.1.0-beta.1
```

Tag push edildiginde workflow su dosyadan tetiklenir:

- .github/workflows/desktop-release.yml

## D) Update popup test release'i (v1.1.0-beta.2)

Asagidaki script tum adimlari calistirir:

```powershell
./scripts/release-next-beta.ps1 -Version 1.1.0-beta.2 -Branch main
```

Alternatif manuel:

```bash
npm version 1.1.0-beta.2 --workspace @mescord/desktop --no-git-tag-version
npm run build:desktop
git add .
git commit -m "release: desktop v1.1.0-beta.2"
git tag v1.1.0-beta.2
git push origin main
git push origin v1.1.0-beta.2
```

## E) Update popup beklenen davranis

1. v1.1.0-beta.1 kurulu Mescord'u ac.
2. Uygulama update kontrol eder.
3. v1.1.0-beta.2 release'i varsa popup gorunur.
4. Kullanici secer:
   - Guncellemeyi indir
   - Kapat (sonra)
5. Indirme tamamlaninca yeniden baslat secenegi gelir.

## F) Kritik Kontrol Listesi

- apps/desktop/package.json -> build.publish owner/repo dogru mu?
- GitHub release assets icinde su dosyalar var mi?
  - Mescord-Setup-<version>.exe
  - latest.yml
  - Mescord-Setup-<version>.exe.blockmap
- Uygulama paketli surumde mi aciliyor? (dev modunda update kontrolu pasif)
