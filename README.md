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


## v6.3
- Telefon Bekleniyor alanı verilen TextLoop davranışına uyarlandı: `Telefon` sabit, `Bekleniyor...` mor gradient kutu içinde width 0 -> auto açılıp kapanır.
- Mor cursor çizgisi nefes alır gibi yanıp söner.
- Kullanıcının verdiği `Live Recording.svg` sol tarafta kullanılır.


## v6.4 iPhone/Safari mikrofon düzeltmesi
- getUserMedia artık iOS için basit `audio:true` ile başlatılır.
- MediaRecorder MIME tipleri tek tek denenir; son çare tarayıcının varsayılan codec'i kullanılır.
- İzin hatası ile codec/cihaz/meşgul mikrofon hataları artık ayrı mesaj gösterir.
- Upload MIME/uzantısı gerçek MediaRecorder çıktısından belirlenir.


## v6.6
- Tamamlanmış her ses kaydının başında sabit Live Recording/REC SVG gösterilir.
- İkon hem PC kayıt listesinde hem telefondaki Kayıtlarım alanında görünür.
- Kayıt ikonları animasyonsuzdur; tamamlanmış kayıt göstergesidir.


## v6.7
- TextLoop supplied prompt structure restored: `Telefon` staticText, `Bekleniyor...` rotating text.
- A visible space is preserved between Telefon and Bekleniyor.
- Animated text, gradient background and cursor changed from violet to red.
- REC SVG is in an independent fixed-width grid slot and does not move when text expands/collapses.
- v6.6 recording REC icons and v6.4 iPhone microphone fixes remain.

## v6.8
- Critical mic-start fix: a failed `device-state` network request no longer gets misreported as a microphone failure.
- Waveform/AudioContext failure no longer stops a valid MediaRecorder session.
- Added explicit MediaRecorder support detection.
- Generic errors now display their browser exception name for diagnosis.
- Fixed waveform wrapper being hidden immediately by `startWave -> stopWave`.
- v6.7 red TextLoop and v6.6 REC icons preserved.

## v6.9
- Fixed the actual ReferenceError: `uploadRecording` had been accidentally removed while refactoring `startRecording`.
- Restored upload handler with Safari MIME/extension handling.
- Successful upload resets recorder/timer and refreshes mobile history.
- Future generic errors display both exception name and message.

## v7.0
- Phone sends a 5-second device heartbeat while the page is alive; desktop stale threshold increased to 45 seconds.
- Foreground/pageshow/online immediately refresh device presence after iOS background throttling.
- Mobile connection card shows a short QR/session reference on the right.
- Device row shows a green `Ses kaydı bilgisayara gönderildi` confirmation after successful upload.
- Starting a new recording clears the previous success confirmation.
- Mobile recording history is rendered as one-line rows.
- v6.9 microphone ReferenceError fix, red TextLoop, and REC SVG indicators are preserved.

## v7.1
- Desktop and mobile recording histories now use the requested compact Apple-like pink/violet/blue/cyan waveform rows.
- Waveforms are deterministic per recording and clickable for seeking; play buttons control the actual signed audio.
- Live recording visualizer now uses a white background and microphone-reactive vertical gradient bars.
- Duplicate lower successful-upload message is hidden; only the green confirmation beside device info remains.
- Success badge is absolutely positioned so it does not push the recorder content downward.
- Mobile QR/session display now shows the full token grouped in blocks instead of only six characters.


## v7.2
- Desktop was fully rebuilt to match the approved dashboard mockup instead of only restyling the old cards.
- Added sidebar, top app bar, combined connection/QR/device card, live recording visual card, and full-width waveform recordings table.
- Existing functional IDs and backend flows are preserved.
- Mobile waveform history remains compact and consistent with desktop.

## v7.3 functional exact-match pass
- Removed the unnecessary top-right doctor profile.
- Mobile always shows doctor identity form for each newly scanned QR; remembered values only prefill.
- Added editable phone model field because Safari cannot reliably expose exact iPhone model.
- Desktop connected-device area now shows doctor, entered phone model, server-observed IP, online/recording state, last-seen and successful-recording confirmation.
- Recording table now has separate Doctor / Device / Date-Time / Duration / Waveform / Actions columns.
- Rebuilt waveform envelope to match the supplied clustered Apple-style reference more closely.
- Play buttons use actual audio elements with signed URLs, async error handling and refresh guidance.
- Sidebar Home / Recordings / Doctors / Settings now perform real actions.
