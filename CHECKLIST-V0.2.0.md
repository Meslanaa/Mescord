# Mescord v0.2.0 - "The Mescord Experience" Güncellemesi

Bu güncelleme, Mescord'un mevcut Dashboard (kart tabanlı) tasarımından sıyrılarak, yatayda 4 parçalı tam teşekküllü (Discord-vari) bir iletişim platformu arayüzüne geçişini temsil eder.

## 1. Yeni Ekran Hiyerarşisi (Layout 2.0)
- [x] **1. Server Rail (En Sol Şerit):** Sadece grup/sunucu ikonlarının ve DM butonunun yer aldığı, yuvarlak hatlı dar dikey menü.
- [x] **2. Kanal Menüsü (Sol Sidebar):** 
  - Üstte Sunucu Adı
  - Kategoriler, Text ve Voice kanalları listesi
  - **En altta:** Kullanıcı profil kartı, Avatar, Kullanıcı Adı, Mikrofon/Kulaklık mute kontrolleri ve Ayarlar butonu (Orijinal Discord yapısı).
- [x] **3. Ana Chat Ekranı (Orta Alan):** 
  - Üstte kanal adı ve konusu.
  - Geniş ve rahat mesaj okuma alanı.
  - Altta eklenti, emoji, GIF destekli gelişmiş mesaj gönderme barı.
- [x] **4. Sağ Menü (Üye Listesi):** O anki sunucudaki veya ses kanalındaki kullanıcıların (Online/Offline/Idle) statülerine göre sıralandığı dinamik liste. Gizlenip açılabilir olacak.

## 2. Taşma ve Hizalama Hatalarının Çözümü
- [x] `ParticipantCard.jsx` içindeki (Owner, Ses dalgaları vb.) birimlerin taşmalarının (`overflow`) Flexbox/Grid güncellemeleriyle çözülmesi.
- [x] Yeni Flex düzeni ile farklı ekran boyutlarında bileşenlerin asla iç içe girmemesi.

## 3. Ses ve İletişim Fonksiyonlarının Entegrasyonu
- [x] Bir ses kanalına girildiğinde alt menüde yeşil renkli "Voice Connected (Sese Bağlanıldı)" ibaresinin çıkması.
- [x] Ses bağlantısı koparılmadan kanallar arası metin chatlerinde gezinebilme özgürlüğü.
- [x] DM (Özel Mesajlar) için ayrı bir Home (Ana Sayfa) sekmesi oluşturulması.

## 4. Animasyon ve Mescord Tarzı
- [x] Tüm menü açılışlarına, hover efektlerine ve sayfa geçişlerine `framer-motion` ile yumuşak geçişler eklenmesi.
- [x] AnimatedBackground ve "Aurora, Ember, Mono" temalarının bu yeni 3 panelli Discord tasarımına uygulanması.
