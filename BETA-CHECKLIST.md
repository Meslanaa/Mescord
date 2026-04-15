# Mescord Beta Roadmap and Execution Checklist

HEDEF: DISCORDDAN 3-4 KAT DAHA IYI KOD KALITESI, TASARIM, ANIMASYON VE OZELLIK DENEYIMI.

Bu dokuman alpha surumden beta surume gecis icin teknik, urun, tasarim, animasyon, guvenlik, performans ve operasyon adimlarini detayli olarak tanimlar.

## 1) Beta Vision

- Hedef: Discord benzeri sesli sohbet akisini masaustu odakli, daha hizli onboarding ve daha canli arayuz ile yeniden yorumlamak.
- Beta cikis kriteri:
  - Desktop installer + update popup + update install flow calisiyor.
  - 6+ kisilik odada ses iletimi stabil ve tekrar baglanma sureleri kabul edilebilir.
  - Kullanici tarafinda en az 3 farkli ses kontrol senaryosu (mute, push-to-talk, cihaz secimi) sorunsuz.
  - Kritik P0/P1 bug backlogu kapatildi.

## 2) Execution Board (Canli Durum)

- [x] Electron desktop package eklendi (apps/desktop).
- [x] Monorepo scriptleri desktop dev/build/publish akisini kapsiyor.
- [x] In-app update popup altyapisi eklendi.
- [x] GitHub Release publish workflow eklendi.
- [x] Opsiyonel update akisi: Kullanici indirir ya da popupi kapatir.
- [x] Mikrofon secimi (audio input listesi + canli cihaz degistirme) eklendi.
- [x] Kalici tercih saklama (isim, renk, mikrofon, son odalar) eklendi.
- [x] Oda ici canli mesajlasma paneli (socket event tabanli) eklendi.
- [x] Tema sistemi (Aurora, Ember, Mono) eklendi.
- [ ] SFU mimarisine gecis (mediasoup/LiveKit) ve buyuk oda optimizasyonu.
- [ ] Moderasyon paneli (mute all + user kick tamam, room lock beklemede).
- [ ] Hesap sistemi + arkadas listesi + davet gecmisi.
- [ ] Crash reporting + telemetry + structured analytics.
- [ ] E2E desktop regression suite.

## 3) Product and UX Streams

### 3.1 Onboarding Stream

- [x] Hemen odaya giris akisi korunuyor.
- [x] Son odalar hizli erisim eklendi.
- [x] Yeni kullanici onboarding turu (3 adimli).
- [ ] Ornek oda simule eden demo mode.
- [ ] Mikrofon test asistani (input level + test playback).

### 3.2 Voice Interaction Stream

- [x] Push-to-talk eklendi.
- [x] Mute/unmute anlik durum senkronu eklendi.
- [x] Mikrofon cihaz secimi + oda icinde canli degistirme eklendi.
- [ ] Cikis cihaz secimi (output sink) desktop odakli eklenecek.
- [ ] Ses profilleri: Gaming / Podcast / Music presets.
- [ ] Otomatik gain ve agresif noise gate ayarlari.

### 3.3 Visual and Animation Stream

- [x] Hero, participant card ve reaction motion sistemi aktif.
- [x] Konusan kullaniciya canli vurgu efekti aktif.
- [ ] Oda giris/cikis sinematik transition paketi.
- [ ] Adaptive animation intensity (dusuk donanim modu).
- [x] Tema sistemi (Aurora, Ember, Mono).

### 3.4 Reliability Stream

- [x] Socket reconnect tabanli stabilite iyilestirmeleri mevcut.
- [ ] Network degradation fallback stratejileri (packet loss modlari).
- [ ] TURN sunucu entegrasyonu (NAT arkasinda daha stabil baglanti).
- [ ] Graceful room restore (uygulama ac-kapat sonrasinda).

## 4) Desktop and Distribution Streams

### 4.1 Packaging and Installers

- [x] Windows NSIS installer config eklendi.
- [x] Versioned artifact naming eklendi.
- [ ] macOS dmg ve Linux AppImage build hatlari.
- [ ] Code signing (Windows + macOS notarization).

### 4.2 Update Stream (GitHub)

- [x] electron-updater ile GitHub feed cekirdek kurulum.
- [x] Uygulama ici popup + indir + yeniden baslat ile kur.
- [x] Kullanici update popupini kapatabilir (zorunlu degil).
- [x] Tag bazli GitHub Actions release pipeline.
- [ ] Delta update optimizasyonu ve rollback stratejisi.

## 5) Backend and Infra Streams

### 5.1 Signaling

- [x] Oda ve peer event akisi calisiyor.
- [ ] Room policy katmani (max users, token tabanli giris).
- [ ] Horizontal scaling icin Redis adapter.
- [ ] Rate limit + abuse guard.

### 5.2 Future SFU Migration Plan

- [ ] SFU secimi (mediasoup vs LiveKit) benchmark dokumani.
- [ ] 50 kullanicilik test odasi ile metrik toplama.
- [ ] Mesh fallback + SFU hybrid topology.

## 6) Quality Engineering Streams

### 6.1 Test Coverage

- [ ] Unit tests: UI hooks, update state machine, room reducers.
- [ ] Integration tests: socket events + peer lifecycle.
- [ ] E2E tests: desktop install, join room, update flow.

### 6.2 Performance Budgets

- [ ] Join-to-audio hedefi: <= 2.5 saniye.
- [ ] Update popup acilis gecikmesi: <= 250ms.
- [ ] UI frame budget: ortalama 55+ FPS.

### 6.3 Security and Privacy

- [x] Preload + context isolation modeli aktif.
- [ ] CSP sertlestirme ve renderer sandbox review.
- [ ] Secret scanning ve dependency audit pipeline.
- [ ] Privacy policy + telemetry opt-in ekrani.

## 7) Beta Release Milestones

### Milestone B1 (Tamamlandi)

- [x] Desktop shell.
- [x] In-app updater popup.
- [x] Device selection.
- [x] Detailed beta board.

### Milestone B2 (Siradaki Sprint)

- [ ] TURN server + network fallback.
- [ ] Moderator controls.
- [ ] Crash and analytics instrumentation.
- [ ] Automated e2e release checks.

### Milestone B3 (Beta Freeze)

- [ ] P0/P1 bug burn-down.
- [ ] Signed desktop releases.
- [ ] Public beta channel + release notes discipline.

## 8) Done in This Iteration

- Desktop uygulama altyapisi electron ile eklendi.
- Kullanici kontrollu update popup (indir / kapat / sonra kur) aktif edildi.
- GitHub uzerinden release yayinlama hattinin workflow iskeleti kuruldu.
- Web UI tarafinda update merkezi, cihaz secimi ve kalici tercih saklama eklendi.
- v1.1.0-beta.1 installer paketi hazirlandi (setup + portable zip + update metadata).
- Git repository baslatildi ve kaynak kod disi ciktilar (.gitignore) dislandi.
- Tag tabanli release ve update testi icin script/rehber eklendi.
- v1.1.0-beta.2 ile masaustu blank-screen sorunu (relative asset path) cozuldu.
- Oda owner rolu, kick-user ve mute-all moderasyon olaylari backend+frontend'e eklendi.
- Discord benzeri oda ici chat paneli ve sistem bildirimleri eklendi.
- Tema secici ve 3 adimli onboarding tour eklendi.
- GitHub Actions release pipeline v1.1.0-beta.4 icin basariyla calisti ve update assetleri yayinlandi.
- Updater owner/repo varsayilanlari Meslanaa/Mescord ile senkron hale getirildi.
