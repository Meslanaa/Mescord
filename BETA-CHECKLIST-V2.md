# Mescord BETA CHECKLIST V2 (V8 Sprint)

Not: Bu dosya V8 kapsamini takip etmek icin korunur. Guncel ana plan dosyasi BETA-CHECKLIST-V3.md.

HEDEF: Social platform katmanini voice deneyimine entegre edip Discord benzeri ama daha hizli ve daha sade bir akis olusturmak.

## 1) V8 Core Scope

- [x] Hesap olusturma + giris + cikis (token tabanli session).
- [x] Arkadas ekleme (request gonder / kabul / reddet).
- [x] Arkadas listesi ve bekleyen istekler paneli.
- [x] Ozel mesajlasma (DM) MVP.
- [x] Grup olusturma MVP (+ varsayilan kanal).
- [ ] Grup ici uyelik daveti ve rol sistemi.
- [ ] Grup ici kanal bazli gercek zamanli chat.
- [ ] Voice room ile grup/channel baglantisini birlestiren gecis akisi.

## 2) Privacy and Data Rules

- [x] Hesap/social verileri GitHub release assetlerine yazilmaz.
- [x] Veriler server tarafinda private data dosyasinda tutulur (`MESCORD_DATA_FILE`).
- [x] API seviyesinde auth-required endpoint ayrimi yapildi.
- [ ] Session hardening (rotation + ip/device fingerprint opsiyonlari).
- [ ] Password policy hardening (argon2 opsiyonu, breach check).

## 3) Product Quality Bar

- [x] Landing ekranina Social Hub V2 paneli eklendi.
- [x] Mobilde tek kolon fallback duzeni eklendi.
- [ ] DM paneline typing indicator + read status.
- [ ] Friends/Groups paneli icin optimistic UI + retry queue.
- [ ] Error state metinleri icin daha net onboarding copy.

## 4) Release Discipline

- [x] Kaynak kod yayini yerine release-only strateji korunur.
- [ ] V8 tamamlandiginda yeni beta release tag'i ve latest.yml dogrulamasi.
- [ ] Canary smoke test: register/login/friend/dm/group akisi.

## 5) V8 Exit Criteria

- [ ] 2 farkli hesap ile friend request -> accept -> DM roundtrip basarili.
- [ ] Grup olusturma ve panelde kalicilik dogrulandi.
- [ ] Desktop updater yeni beta surumunu otomatik algiliyor.
- [ ] P0/P1 bug listesi temiz.
