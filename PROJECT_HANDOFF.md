# Doctor Recorder — Project Handoff

Bu dosya her tamamlanan Doctor Recorder işi sonunda güncellenir. Yeni çalışmada önce bu dosya ve Dikte2 projesindeki
`.agents/skills/doctor-recorder-web/SKILL.md` okunmalıdır.

## Kaynak ve yayın

- Gerçek kaynak klasörü: `C:\Users\Sinan\Desktop\mic\DoktorKayit-v94-Fresh-Connection-Mic-Permission`.
- GitHub deposu: `CLassMaN89/doctor-recorder`, dal: `main`.
- Canlı site: `https://classman89.github.io/doctor-recorder/`.
- Yerel kaynak klasörü Git deposu değildir; yayın için geçici klon kullanılır.
- Her doğrulanmış değişiklik, yalnızca değişen dosyalarla commit edilip GitHub Pages üzerinde kontrol edilir.

## Dosya haritası

- `index.html`: masaüstü paneli ve telefon kayıt ekranı; CSP ve sürümlü JS/CSS bağlantıları.
- `app.js`: kayıt, yükleme, panel, liste, filtre, bildirim, tema ve Supabase API akışları.
- `style.css`: açık/koyu tema ve duyarlı masaüstü/telefon arayüzü.
- `live.html`: telefonu canlı mikrofon olarak bağlayan WebRTC/Trystero sayfası.
- `mobile-ui.js`, `player-skin.js`, `qr-scanner.js`, `session-guard.js`, `stream-bridge.js`: ayrılmış yardımcı davranışlar.
- `*.svg`, `*.png`, `*.webp`: arayüz, animasyon ve cihaz görselleri.

## Arka uç bağlantısı

- Supabase proje referansı: `gzkaeiqtocuwofolfpty`.
- API: `doctor-recorder-api` Edge Function.
- İstemcide yalnızca publishable anahtar bulunur; service-role anahtarı istemciye yazılmaz.
- Klinik işlemleri hesap girişiyle; telefon işlemleri oturum ve cihaz belirteçleriyle yürür.

## Son doğrulanan durum

- GitHub Pages `main` dalının kökünden yayın yapıyor ve HTTPS zorunlu.
- Canlı site HTTP 200 dönüyor.
- GitHub'daki `app.js` güncel Supabase proje referansını kullanıyor.

## Son işte değişen dosyalar

- `PROJECT_HANDOFF.md`: dosya haritası, bağlantılar ve kalıcı iş sonu kayıt düzeni eklendi.

## Açık işler

- Her Doctor Recorder değişikliğinde bu dosyanın son durum, değişen dosyalar ve açık işler bölümleri güncellenmelidir.
