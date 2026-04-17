# Mescord Desktop Auto Update Flow (GitHub)

Bu dokuman Mescord desktop uygulamasinin guncellemeleri GitHub Releases uzerinden nasil cektigini aciklar.

## Runtime Akis

1. Uygulama acilisinda (paketli surumde) update kontrolu yapilir.
2. Yeni surum varsa renderer'a update event gonderilir.
3. Kullanici popup'ta secim yapar:
   - Guncellemeyi indir
   - Kapat / sonra
4. Indirme tamamlaninca popup yeniden baslatma secenegi sunar.
5. Kullanici onaylarsa uygulama yeniden baslar ve yeni surum yuklenir.

## Konfig

Desktop package build publish bolumunde GitHub provider tanimlidir:

- owner: MeslaN
- repo: Mescord

Gerekiyorsa runtime override icin environment degiskenleri:

- MESCORD_UPDATE_OWNER
- MESCORD_UPDATE_REPO

## Release Cikarma

1. Surum numarasini guncelle.
2. Tag olustur:

```bash
git tag v1.1.0-beta.1
git push origin v1.1.0-beta.1
```

3. GitHub Actions workflow [desktop-release.yml](../.github/workflows/desktop-release.yml) tetiklenir.
4. Workflow, release assetleri ve metadata dosyalarini GitHub Release'e yukler.
5. Masaustu istemciler bu release metadata'sini cekerek update popup'i tetikler.

## Notlar

- Update kontrolu sadece paketlenmis desktop surumde aktiftir.
- Public repo senaryosunda ekstra token gerekmez; workflow tarafinda GITHUB_TOKEN kullanilir.
- Private repo veya rate limit agir senaryolarinda GH_TOKEN ve release politikasi sertlestirilmelidir.
