# DoctorRecorder v2

GitHub Pages + Supabase ile uygulamasız telefon dikta demosu.

## Gerekli tek Supabase ayarı

Supabase Dashboard > Authentication > Providers > Anonymous Sign-Ins seçeneğini açın.

Bu ayar PC tarafında kullanıcıya form göstermeden güvenli bir geçici oturum oluşturmak için kullanılır.

## Akış

1. PC GitHub Pages adresini açar.
2. QR otomatik oluşturulur.
3. Doktor QR kodu telefondan okutur.
4. Safari/Chrome mikrofon izni ister.
5. Doktor Kaydı Başlat / Kaydı Bitir yapar.
6. Ses Supabase private Storage alanına yüklenir.
7. Kayıt PC ekranında otomatik görünür ve dinlenebilir.

## GitHub'a yüklenecek dosyalar

- index.html
- app.js
- style.css

README zorunlu değildir.
