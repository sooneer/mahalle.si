# mahalle.si

Ataşehir odaklı yerel mahalle rehberi ve topluluk portalı (`ataşehir.mahalle.si`). Bu sürüm bir MVP: ana sayfa arayüzü ve bülten kaydı çalışıyor. Rehber içerikleri (eczane, okul, esnaf vb.) henüz yok, bağlantılar "çok yakında" bildirimi gösteriyor.

## Yığın

Paket ve build adımı yok. Sade HTML, CSS ve JS kullanılıyor, Cloudflare Workers üzerinde çalışıyor.

- `public/` statik dosyalar (Workers Assets):
  - `index.html` sayfa yapısı ve SVG ikon sprite'ı (`#i-*` sembolleri, `#map-base`).
  - `styles.css` tasarım token'ları `:root` içinde (turkuaz, turuncu, lacivert).
  - `app.js` mobil menü, Türkçe karakter duyarsız arama → kategori eşleme (`KEYWORDS`), toast, bülten formu ve Turnstile.
  - `img/hero-scene.svg` hero mahalle illüstrasyonu. Animasyonları dosyanın içindeki `<style>`'da.
- `src/worker.js` Worker. Yalnızca `/api/*` istekleri Worker'a gelir (`run_worker_first`), geri kalanı `env.ASSETS`'e düşer.
  - `POST /api/subscribe` sırasıyla Turnstile doğrular, e-postayı doğrular ve D1'e `INSERT OR IGNORE` ile yazar.
- `schema.sql` D1 şeması (`subscribers` tablosu).
- `wrangler.jsonc` Worker `mahalle-si`, D1 binding `DB` (`mahalle-si-emails`), custom domain `mahalle.si`.

## Komutlar

```sh
npx wrangler dev                       # yerel önizleme (http://localhost:8787)
npx wrangler deploy                    # yayına alma
npx wrangler d1 execute mahalle-si-emails --remote --file=schema.sql
npx wrangler d1 execute mahalle-si-emails --remote --command "SELECT * FROM subscribers"
```

## Turnstile

- Sitekey `app.js` içinde (`TURNSTILE_SITEKEY`), action `subscribe`.
- Secret Worker secret'ı olarak saklanır: `TURNSTILE_SECRET` (`wrangler secret put`). Secret'ı asla koda, dosyaya ya da sohbete yazma.
- Worker, siteverify sonucunda hostname'in tam olarak `mahalle.si` olmasını bekler. `localhost`'ta bülten kaydı bu yüzden 403 döner.
- `ataşehir.mahalle.si` alt alan adına geçilirse şu üçü birlikte güncellenmeli:
  1. `wrangler.jsonc` içindeki route,
  2. `src/worker.js` içindeki `TURNSTILE_EXPECTED_HOSTNAME`,
  3. Turnstile widget'ının domain listesi.

## Kurallar

- Yanıtlar ve arayüz metinleri Türkçe. ö, ş, ç, ı, ğ, ü karakterleri doğru kullanılmalı. Büyük/küçük harf dönüşümünde `toLocaleLowerCase("tr-TR")` kullan.
- Kullanıcı açıkça istemeden `wrangler deploy` çalıştırma.
- "24 Okul" ve "18 Mağaza" gibi sayılar yer tutucudur. Gerçek veri gelmeden yayına alınacaksa bunu hatırlat.
- Hareket içeren her şey `prefers-reduced-motion` altında kapatılmalı.
- Mobil ekran görüntüsü için headless Chrome'un en küçük görünüm genişliği 504px. 390px görmek için sayfayı `<iframe style="width:390px">` içinde aç.
