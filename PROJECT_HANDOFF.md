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
- Tekli indirme MP3 verir. Her kayıt satırında seçim kutusu bulunur; görünür/filtrelenmiş kayıtlardan işaretlenenler `Seçilenleri MP3 İndir` ile tek ZIP içinde indirilebilir.
- Panelin 2,5 saniyelik sorgusu sürer fakat veri değişmedikçe kayıt DOM'u yeniden kurulmaz; hover ve oynatma durumu sıfırlanmaz.
- Dalga alanı ile oynat/indir/sil düğmelerini ayıran sabit işlem grubu sayesinde kontroller dar sütunda da tek satırda kalır.
- Geniş masaüstünde sol QR/canlı kayıt sütunu 330–385 px aralığına daraltıldı; sağ kayıt listesine ve ses dalgası/işlem alanına daha fazla genişlik ayrıldı.
- Daralan sol sütunda QR ve bağlantı bilgileri alt alta merkezlendi; canlı kayıt düğmeleri/status satırı kart dışına taşmayacak şekilde esnekleştirildi. Kayıt dalgasının sağında play grubundan önce görünür boşluk bırakıldı.
- QR dış kutusu zaten ortadaydı ancak `#qrcode img` kendi kapsayıcısının solunda kalıyordu; iç QR görseli de grid merkezine alındı. Kayıt dalgasındaki 72 sabit genişlikli çubuk dar hücrede esneyebilir hale getirildi ve işlem grubundan 16 px ayrıldı.
- QRCode.js aynı anda gizli canvas ve görünür img üretiyor: canvas kesin olarak gizli, yalnız img ortalı tutulur. Dalga yalnız çubukları esnetmekle bırakılmaz; hücresinden 38 px kısa çizilir ve işlem grubundan ayrıca 18 px ayrılır.
- Dalga/play ayrımı CSS boşluğu ile değil DOM yapısıyla garanti edilir: `apple-wave`, bağımsız `play` düğmesi ve `wave-secondary` (indir+sil) üç ayrı grid sütunudur. Dalga en fazla 64 px, sütun aralıkları 12 px'tir.
- Son karar: kayıt tablosu 10 gerçek sütundur. `SES DALGASI`, `OYNAT`, `İNDİR`, `SİL` başlıkları ve satır öğeleri aynı üst seviye gridde ayrı sütunlardadır; ortak işlem kapsayıcısı yoktur.

## Son işte değişen dosyalar

- `app.js`: satır bazlı seçim, görünenlerin tümünü seçme ve yalnız işaretli kayıtları MP3/ZIP indirme eklendi; işlem düğmeleri tek grup halinde üretildi.
- `mp3-worker.js`, `lame.min.js`: yerel, worker tabanlı MP3 kodlayıcı eklendi.
- `app.js`: dalga, play, indir ve sil öğeleri satırın dört ayrı üst seviye grid hücresine ayrıldı.
- `style.css`: masaüstü/tablet/mobil için ayrı sütun ve grid-area kuralları eklendi.
- `index.html`: dört ayrı tablo başlığı eklendi; `app.js` 166 ve `style.css` 176 yapıldı.
- `PROJECT_HANDOFF.md`: MP3 ve panel yenileme kararları kaydedildi.

## Açık işler

- Gerçek iPhone ve Android cihazda kısa/uzun kayıt alınarak MP3 kodlama süresi, pil ve bellek kullanımı kullanıcı tarafından gözlenmelidir.
- Klinik hesabıyla yeni MP3 kaydın tekli ve toplu indirmesi canlı ortamda kontrol edilmelidir.
- Kayıt geçmişi yüklenirken eşzamanlı `history` çağrıları engellenir; geçici ağ hatalarında çağrı iki kez kontrollü olarak yeniden denenir. Başarısız istek artık yanıltıcı biçimde "Henüz kayıt yok" göstermez.
- Masaüstü paneli telefon genişliğinde (≤760 px) mobil kart düzenine geçer: kayıt bilgileri, dalga ve üç işlem düğmesi ayrı alanlarda; filtreler ve toplu MP3 düğmesi tam genişlikte görünür. Masaüstü sütun düzeni değişmez.
- Mobil kayıt kartında kırmızıyla işaretlenen alt bölüm tek satırdır: tarih, ses dalgası, Play, İndir ve Sil yan yana görünür.
