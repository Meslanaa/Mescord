# Mescord (Beta Desktop Track)

Mescord, WebRTC tabanli cok kullanicili sesli sohbet uygulamasinin beta desktop odakli surumudur.
Bu surumde hedef: alpha'dan cikarak masaustu deneyimini, guncelleme altyapisini ve ses kontrol yeteneklerini belirgin sekilde guclendirmek.

## Beta Olarak Hazir Olanlar

- Electron tabanli masaustu uygulama paketi
- In-app update popup (GitHub release uzerinden kontrol)
- Kullanici secimine dayali update akisi:
  - Indir
  - Sonra
  - Hazir oldugunda yeniden baslatip yukle
- Cok kullanicili sesli oda (WebRTC mesh)
- Push-to-talk (Space)
- Mikrofon cihaz secimi ve canli degistirme
- Kalici tercihler (isim, renk, son odalar, secili mikrofon)
- Anlik emoji reaksiyonlari ve canli animasyonlar

## Teknolojiler

- Frontend: React + Vite + Framer Motion + Socket.IO Client
- Backend: Node.js + Express + Socket.IO
- Desktop: Electron + electron-updater + electron-builder
- Medya: WebRTC (STUN)

## Kurulum

```bash
npm install
```

## Gelistirme Komutlari

Web + signaling server:

```bash
npm run dev
```

Web + signaling server + desktop electron:

```bash
npm run dev:desktop
```

Yalnizca desktop shell acmak (hazir web URL bekler):

```bash
npm run dev:desktop:only
```

## Build ve Yayin

Web build:

```bash
npm run build
```

Desktop installer build (Windows NSIS):

```bash
npm run build:desktop
```

GitHub release'e desktop publish:

```bash
npm run publish:desktop
```

## Servis Adresleri

- Web (dev): http://localhost:5173
- Signaling server: http://localhost:3001
- Desktop dev web: http://localhost:5174
- Desktop dev signaling: http://localhost:3002

## Cevresel Degiskenler

Server:

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

Web:

```env
VITE_SIGNALING_URL=http://localhost:3001
```

Desktop update override (opsiyonel):

```env
MESCORD_UPDATE_OWNER=MeslaN
MESCORD_UPDATE_REPO=Mescord
```

## Otomatik Guncelleme (GitHub)

Update akisi desktop paketli surumde aktiftir.

1. Uygulama acilisinda update kontrolu yapar.
2. Yeni surum varsa popup gorunur.
3. Kullanici isterse indirir, istemezse popup'i kapatir.
4. Indirme bitince yeniden baslatma secenegi ile update uygulanir.

Detay dokuman:

- [docs/desktop-update-flow.md](docs/desktop-update-flow.md)

## Beta Checklist

Detayli ve canli durumlu beta plani:

- [BETA-CHECKLIST.md](BETA-CHECKLIST.md)

## Klasor Yapisi

```txt
Mescord/
  apps/
    desktop/
      main.cjs
      preload.cjs
    server/
      src/index.js
    web/
      src/
        App.jsx
        hooks/
          useVoiceRoom.js
          useDesktopUpdater.js
        components/
          AnimatedBackground.jsx
          DesktopUpdateModal.jsx
          ParticipantCard.jsx
          ReactionBurst.jsx
        styles/global.css
  .github/workflows/desktop-release.yml
  BETA-CHECKLIST.md
  package.json
```

## Known Constraint

Bu surum mesh WebRTC modelini kullanir. Kalabalik odalar icin (10+ eszamanli aktif konusmaci) SFU mimarisine gecis beta sonrasi ana hedeftir.
