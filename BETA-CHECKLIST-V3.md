# Mescord BETA CHECKLIST V3 (V9-V10 Release Plan)

HEDEF: Discord ile ozellik paritesini yakalamak, UI/UX ve animasyon kalitesinde daha premium bir deneyim sunmak, performans ve guvenlikte daha guclu bir masaustu + web urunu cikarmak.

Prensip:
- Discord benzeri bilgi mimarisi (Server -> Channel -> Thread/DM) korunur.
- Mescord farki: daha net tipografi, daha cesur motion dili, daha hizli akis, daha az tikla daha fazla kontrol.
- Release disiplini: public source dagitimi yok, sadece release artifact dagitimi.

## 1) Product North Star

- [ ] 30 saniye icinde yeni kullanici kayit + servere katilim + voice baglanti.
- [ ] 2 tikla DM baslatma ve ayni anda voice room gecisi.
- [ ] Moderasyon islemlerinde owner/admin icin tek panelden tam kontrol.
- [ ] 10+ kisilik odada kabul edilebilir ses kalitesi ve stabil reconnect.
- [ ] Tasarim ve animasyon butunlugunde Discord seviyesini gecen premium his.

## 2) Discord Parity Matrix (V9-V12)

### 2.1 Hesap ve Kimlik

- [x] Register / Login / Logout (token tabanli).
- [ ] Email verify + sifre sifirlama akisi.
- [ ] Coklu cihaz session yonetimi (aktif oturumlar listesi).
- [ ] 2FA (TOTP) opsiyonu.
- [ ] Cihaz bazli guvenlik bildirimleri.

### 2.2 Social Graph

- [x] Friend request gonder / kabul / reddet.
- [x] Arkadas listesi paneli.
- [ ] Block / Unblock sistemi.
- [x] Presence (online, idle, dnd, invisible).
- [ ] Activity status (oyun, toplanti, stream, custom).

### 2.3 Server ve Channel Yonetimi

- [x] Grup (server) olusturma MVP.
- [x] Varsayilan kanal olusturma.
- [ ] Kategori yapisi (text/voice channels grouping).
- [ ] Kanal bazli izinler (role + user overrides).
- [ ] Invite link olusturma (expiry + max use).
- [ ] Server ayarlari: isim, ikon, aciklama, locale.

### 2.4 Mesajlasma

- [x] DM history + gonderim MVP.
- [x] Server text kanalinda realtime mesajlasma.
- [ ] Thread / reply modeli.
- [ ] Mesaj duzenleme / silme / pinleme.
- [ ] Mention sistemi (@user, @role, @everyone kontrollu).
- [ ] Dosya eki ve medya onizleme.

### 2.5 Voice ve Media

- [x] Voice room join/leave + WebRTC signaling.
- [x] Mute / push-to-talk / mic secimi.
- [x] Owner moderasyon (mute all, kick, room lock).
- [ ] Channel bazli voice kalici odalar.
- [ ] Screen share MVP (desktop once).
- [ ] Noise suppression profilleri (balanced/aggressive).
- [ ] SFU migration adimi (buyuk oda kapasitesi icin).

### 2.6 Moderasyon ve Guvenlik

- [x] Room lock / kick / mute all.
- [ ] Role sistemi (owner/admin/mod/member/guest).
- [ ] Audit log (kim neyi ne zaman degistirdi).
- [ ] Rate limit + anti-spam + flood guard.
- [ ] Report / safety center paneli.

## 3) Mescord Design V3 (Discord benzeri, daha premium)

### 3.1 Visual Direction

- [x] Sol rail + server icon stack + channel tree layout (Discord benzeri bilgi mimarisi).
- [ ] Mescord brand dili: daha sinematik arkaplan, daha net kontrast, daha rafine glow kullanimi.
- [ ] Kart tabanli degil, yuzey katmanli panel mimarisi (depth ile okunabilirlik).
- [ ] Desktop-first responsive grid + mobile compact layout.

### 3.2 Typography and Hierarchy

- [ ] Baslik ve body fontlari ayrik kullanilir (display + readability).
- [ ] 8-pt spacing ve typographic scale standardize edilir.
- [ ] Her panelde en fazla 3 seviye gorsel oncelik kullanilir.
- [ ] Bilgi yogun gorunumde line-height ve renk kontrasti optimize edilir.

### 3.3 Component System

- [ ] Server switcher, channel list item, DM row, message bubble, member list item tokenlastirilir.
- [ ] Button, input, modal, dropdown, context-menu davranislari tek sistemde birlestirilir.
- [ ] Skeleton loading ve empty state setleri standartlasir.
- [ ] Tema tokenlari (light, dark, mono, ember+) component seviyesinde desteklenir.

## 4) Motion and Animation V3

- [ ] Ana navigasyon gecislerinde 120-220ms spring-temelli motion standardi.
- [ ] Listelerde staggered reveal ama sadece ilk mount aninda.
- [ ] Voice speaking indicators daha organik pulse + RMS temelli adaptif animasyon.
- [ ] Presence degisimlerinde dikkat dagitmayan micro-motion dili.
- [ ] Drag/drop, context menu ve modal gecisleri tek easing profiline alinacak.

Animation budget:
- [ ] Ortalama 55+ FPS hedefi korunur.
- [ ] Dusuk donanim modunda motion azaltma otomatik aktif olur.
- [ ] GPU maliyetli efektler panel bazli kapatilabilir.

## 5) Architecture V3

### 5.1 Service Boundaries

- [ ] gateway-service: websocket event ingress/egress + auth handshake.
- [ ] identity-service: account, session, 2FA, password flows.
- [ ] social-service: friendship, blocklist, presence.
- [ ] guild-service: servers, channels, roles, permissions.
- [ ] messaging-service: DM + channel message + thread.
- [ ] media-service: voice routing, device profiles, SFU migration katmani.
- [ ] moderation-service: audit log, sanctions, abuse controls.

### 5.2 Data Layer

- [x] Private JSON persistence (MESCORD_DATA_FILE) ile baseline.
- [ ] PostgreSQL migration (core entities).
- [ ] Redis cache + pub/sub (presence, typing, hot timeline).
- [ ] Object storage adapter (media/file uploads).
- [ ] Migration tooling + schema versioning.

### 5.3 Reliability

- [ ] Idempotent command pattern (message send/edit/delete).
- [ ] At-least-once event + de-duplication key.
- [ ] Circuit breaker + retry policy.
- [ ] Health probes + structured service metrics.

## 6) API and Protocol Checklist

- [ ] REST + websocket event naming convention dokumani.
- [ ] Client/server version compatibility matrix.
- [ ] Typed payload contracts (schema validation zorunlu).
- [ ] Permission check middleware her mutating endpointte aktif.
- [ ] Error code catalog (UX tarafina maplenen).

## 7) Security and Privacy V3

- [x] Public release assets icinde account verisi yok.
- [x] Server-side private data storage aktif.
- [ ] Session rotation + refresh token stratejisi.
- [ ] Password hashing hardening (argon2id hedef).
- [ ] Brute-force protection ve IP/user throttle.
- [ ] Device trust modeli ve suspicious login akisi.
- [ ] Secret scanning + dependency audit pipeline.
- [ ] Data retention ve delete-my-data akisi.

## 8) QA and Test Strategy

### 8.1 Functional

- [ ] Account lifecycle e2e (register -> verify -> login -> reset).
- [ ] Friendship lifecycle e2e (request -> accept -> block).
- [ ] DM e2e (send/edit/delete/read status).
- [ ] Guild lifecycle e2e (create -> invite -> role -> channel).
- [ ] Voice lifecycle e2e (join -> mute -> reconnect -> leave).

### 8.2 Non-Functional

- [ ] Join-to-audio p95 <= 2.5s.
- [ ] DM send latency p95 <= 250ms.
- [ ] Channel switch render <= 400ms.
- [ ] Memory leak regression scriptleri.
- [ ] Long-session soak test (3 saat).

### 8.3 Release Gate Tests

- [ ] Desktop install + auto-update smoke.
- [ ] latest.yml checksum/asset consistency check.
- [ ] Canary smoke: register/login/friend/dm/group/voice.
- [ ] Rollback dry-run plan testi.

## 9) V9 Sprint Scope (Bu Iterasyon)

Zorunlu V9 deliverables:
- [x] BETA-CHECKLIST-V3 olusturuldu.
- [x] Discord parity hedefi ve tasarim/motion standardi dokumante edildi.
- [x] V8 foundation korunarak V9 release hazirlandi.
- [x] v1.1.0-beta.9 release yayinlandi (latest.yml + setup.exe + blockmap).
- [x] GitHub API ve latest.yml ile release metadata dogrulandi.
- [x] Group role/permission altyapisi (baslangic).
- [x] Channel text realtime katmani (baslangic).
- [x] Presence + typing indicator (baslangic).

V10 blocker fix deliverables:
- [x] Desktop/file-origin kaynakli register/login CORS engeli cozuldu.
- [x] Odaya katilim akisina connect_error + timeout + net hata mesaji eklendi.
- [x] Runtime Baglanti Ayarlari (API URL + Signaling URL) landing ekrana eklendi.
- [x] Updater kurulum modu mevcut kurulum dizinini koruyacak sekilde degistirildi.
- [x] v1.1.0-beta.10 release yayinlandi ve latest.yml dogrulandi.

V11 discord-ia uplift deliverables:
- [x] Oda ekrani Discord benzeri IA'ya tasindi (server rail + channel tree + center + member list).
- [x] Group channel realtime mesaj socket eventi ve persistent store katmani eklendi.
- [x] Group channel typing indicator socket eventi eklendi.
- [x] Presence status (online/idle/dnd/invisible) endpoint + socket update akisi eklendi.
- [x] Channel list hizli filtreleme ve slash baseline (/me) aktif edildi.

## 10) UX Backlog (High Priority)

- [ ] Sol panel server switcher + hover tooltips + unread badges.
- [x] Channel list filtre + hizli arama.
- [x] DM panelinde pinned conversations.
- [x] Message composer: slash command baseline.
- [ ] Notification center (mention, invite, friend updates).

## 11) Moderation Backlog (High Priority)

- [ ] Role templates (community, gaming, team).
- [ ] Auto-mod rules (keyword, duplicate, flood).
- [ ] Timeout/slow-mode per channel.
- [ ] Moderation case timeline.

## 12) Infrastructure and Ops Backlog

- [ ] CI pipeline: lint + unit + integration + artifact signing checks.
- [ ] Preview environment per release-candidate.
- [ ] Runtime logs centralization + alerting.
- [ ] Backup/restore strategy for social and messaging data.

## 13) Release Discipline (Strict)

- [x] Release-only publishing policy korunur.
- [x] latest.yml + setup exe + blockmap disinda dagitim yok.
- [ ] Her release oncesi smoke checklist zorunlu.
- [ ] Her release sonrasi telemetry + crash triage zorunlu.

## 14) V9 Exit Criteria

- [x] Discord benzeri temel IA aktif (server/channel/dm bilgi mimarisi).
- [ ] 2 hesapla arkadaslik + DM + voice roundtrip sorunsuz.
- [ ] Desktop updater beta.9 surumunu algilayip update akisini tamamlar.
- [ ] P0/P1 issue listesi release aninda temiz olur.

## 15) Risk Register

- [ ] JSON store'dan SQL'e migrationda veri tutarlilik riski.
- [ ] Realtime event karmasikliginda race-condition riski.
- [ ] Yogun animasyonun dusuk cihazlarda FPS dusurme riski.
- [ ] Voice + messaging ayni anda yuk altinda latency riski.

Mitigation:
- [ ] Feature flag + staged rollout.
- [ ] Synthetic load tests ve rollback hazirligi.
- [ ] Motion degrade mode default fallback.

## 16) Decision Log (V3)

- Discord benzeri bilgi mimarisi benimsenir, ama gorsel dil birebir kopya olmaz.
- Mescord farki: daha rafine motion, daha net kontrast, daha hizli aksiyon akislaridir.
- Kisa vadede release-only dagitim politikasindan taviz verilmez.
- V9 ile birlikte V3 dokumani ana plan haline gelir.
