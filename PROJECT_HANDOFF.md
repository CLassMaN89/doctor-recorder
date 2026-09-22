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
- `mp3-worker.js`: telefonda ve eski kayıt indirmelerinde PCM sesi arka planda 64 kb/sn MP3'e kodlar.
- `lame.min.js`: projeye sabitlenen `lamejs@1.2.1` tarayıcı MP3 kodlayıcısı.
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
- Telefon, tarayıcının ürettiği geçici kaydı durdurunca yerel worker ile MP3'e çevirip mevcut Supabase yükleme akışına `recording.mp3` olarak gönderiyor.
- Tekli indirme MP3 verir; geçerli filtredeki ilk 10 kayıt `Toplu MP3 İndir` ile tek ZIP içinde indirilebilir.
- Panelin 2,5 saniyelik sorgusu sürer fakat veri değişmedikçe kayıt DOM'u yeniden kurulmaz; hover ve oynatma durumu sıfırlanmaz.
- Dalga, oynat, indir ve sil kontrolleri tek satıra sığdırıldı.

## Son işte değişen dosyalar

- `app.js`: telefonda MP3 dönüşümü, eski kayıtları MP3 indirme, en fazla 10 kaydı ZIP indirme ve değişmedikçe DOM'u koruyan panel yenilemesi eklendi.
- `mp3-worker.js`, `lame.min.js`: yerel, worker tabanlı MP3 kodlayıcı eklendi.
- `style.css`: işlem düğmeleri tek satıra alındı ve toplu indirme düğmesi biçimlendirildi.
- `index.html`: toplu indirme düğmesi eklendi; `app.js` 163 ve `style.css` 169 yapıldı.
- `PROJECT_HANDOFF.md`: MP3 ve panel yenileme kararları kaydedildi.

## Açık işler

- Gerçek iPhone ve Android cihazda kısa/uzun kayıt alınarak MP3 kodlama süresi, pil ve bellek kullanımı kullanıcı tarafından gözlenmelidir.
- Klinik hesabıyla yeni MP3 kaydın tekli ve toplu indirmesi canlı ortamda kontrol edilmelidir.
