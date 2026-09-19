# DoctorRecorder

Uygulama kurmadan, QR kod üzerinden iPhone/Android tarayıcısında ses kaydı yapmaya yarayan statik demo.

## Ne yapar?

- PC ekranında tek kullanımlık oturum kodu ve QR üretir.
- Doktor QR'ı telefon kamerasıyla okutur.
- Telefon Safari/Chrome'da kayıt sayfasını açar.
- Mikrofon izni sonrası kayıt başlat/duraklat/bitir yapılabilir.
- Kayıt telefonda dinlenebilir ve dosya olarak kaydedilebilir.

## Önemli

Bu sürümde backend yoktur. Ses dosyası GitHub'a veya bir sunucuya otomatik gönderilmez. Demo amacıyla kayıt cihaz üzerinde oluşturulur.

## GitHub Pages'e yayınlama

1. GitHub'da `doctor-recorder` isminde yeni bir public repository oluşturun.
2. Bu klasördeki `index.html`, `style.css`, `app.js` dosyalarını repository köküne yükleyin.
3. Repository > Settings > Pages bölümüne gidin.
4. Source: `Deploy from a branch` seçin.
5. Branch: `main`, Folder: `/ (root)` seçip Save'e basın.
6. Birkaç dakika sonra GitHub size HTTPS adresi verir, örneğin:
   `https://KULLANICIADI.github.io/doctor-recorder/`
7. Bu adresi PC'de açtığınızda QR kod otomatik olarak aynı GitHub Pages adresinin telefon kayıt sayfasını üretir.

## Sonraki aşama

Gerçek hastane kullanımında kayıtların otomatik PC'ye düşmesi için backend/API, kimlik doğrulama, tek kullanımlık kısa ömürlü token, yetkilendirme, audit log ve güvenli depolama eklenmelidir.
