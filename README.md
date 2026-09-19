# Doktor Kayıt v6.0 — Çoklu Doktor / Çoklu Telefon

Bu paket önceki yama dosyalarını tek yapıda toplar.

## Akış
1. Masaüstü yeni QR üretir.
2. Aynı QR'ı birden fazla doktor okutabilir.
3. İlk bağlantıda Ad + Soyad ekranı açılır.
4. Telefon için kalıcı rastgele device_id oluşturulur.
5. Sunucu ayrıca ayrı device_connection + device_token üretir.
6. IP adresi Edge Function tarafından alınır; tarayıcıdan IP istemiyoruz.
7. Telefon modeli tarayıcının izin verdiği ölçüde gösterilir.
8. Her ses kaydı device_connection_id ile ilgili doktora/telefona bağlanır.
9. Masaüstünde doktor, telefon modeli, IP, canlı durum ve kayıtlar ayrı görünür.

## Mobil kayıt
- Mavi mikrofona dokun: kayıt başlar.
- Mikrofon kırmızı olur.
- Gerçek mikrofon verisine tepki veren renkli Siri-benzeri dalga görünür.
- Kırmızı mikrofona tekrar dokun: kayıt biter.
- Ses otomatik yüklenir.
- Ayrı Kaydı Bitir butonu yoktur.

## Oturum bittiğinde
- Mikrofon devre dışı kalır.
- "Lütfen QR kodunu okutun" görünür.
- Dokununca arka kamera açılır.
- Yeni QR okununca yeni oturuma geçilir.

## GitHub
Bu 3 dosyayı repo köküne yükleyin:
- index.html
- style.css
- app.js

Önceki ek JS dosyaları artık index.html tarafından kullanılmaz:
session-guard.js, mobile-ui.js, stream-bridge.js, player-skin.js, qr-scanner.js

Silmek zorunda değilsiniz; ancak v6 bunları yüklemez.

## Supabase
Backend v4 olarak güncellendi.
Yeni tablo: public.device_connections
recordings.device_connection_id eklendi.
device_connections RLS açık ve public client erişimi revoke edildi; telefon işlemleri Edge Function üzerinden yürür.

Not: Bu prototip hâlâ PC tarafında anonymous Supabase auth kullanıyor. Klinik production için personel kimlik doğrulaması, daha sıkı CORS, audit/retention ve kurumsal güvenlik kontrolleri gerekir.
