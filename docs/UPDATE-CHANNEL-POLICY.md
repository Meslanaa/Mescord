# Update Channel Policy

Bu depo public oldugunda sadece update dagitimi icin kullanilir.

## Zorunlu Kurallar
1. Uygulama kaynak kodu public depoya asla push edilmez.
2. Public depoda sadece update dagitimi ile ilgili dosyalar ve dokumanlar bulunur.
3. Her release surumunde sadece electron-updater ile uyumlu artifactler yayinlanir:
	- latest.yml
	- Mescord-Setup-<version>.exe
	- Mescord-Setup-<version>.exe.blockmap

## Release Isletim Plani
1. Build her zaman private kaynak koddan alinır.
2. Public depoda source yerine sadece release asset yayinlanir.
3. Release sonrasi latest.yml icindeki version degeri, setup exe surumu ile birebir ayni olmali.
4. Yayin tamamlaninca release sayfasinda en son tag tek "latest" dagitim kaynagi olarak kullanilir.

## Updater Davranis Politikasi (Windows)
1. NSIS one-click + per-user kurulum kullanilir.
2. Sessiz kurulum icin allowElevation kapali tutulur.
3. Update indirildikten sonra uygulama sessiz kurulumla arka planda guncellenir ve tekrar acilir.
4. Hedef: kullanicinin her guncellemede setup sihirbazi gormemesi.
5. Daha once "tum kullanicilar" olarak kurulmus eski surumlerde, UAC'yi kalici kaldirmak icin bir kez "sadece benim icin" kurulumuna gecis gerekebilir.

## Unutma Notu
Bu projede bundan sonra update modeli sabittir: source public degil, dagitim sadece release artifactleri ile yapilir.
