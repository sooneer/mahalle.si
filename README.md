# mahalle.si

İl, ilçe ve mahalle bazında yerel rehber. MVP yalnızca İstanbul'u kapsıyor. İçinde yalnızca Ataşehir ilçesi ve Küçükbakkalköy mahallesi aktif. Yol haritası için [roadmap.md](roadmap.md) dosyasına bak.

Site sade HTML, CSS ve JS ile yazıldı, Cloudflare Workers üzerinde çalışıyor. Veritabanı yerine `public/data/` altındaki JSON dosyaları kullanılıyor. Paket kurulumu ya da build adımı yok.

## Gereksinimler

- [Node.js](https://nodejs.org/) 20 veya üstü. `npx` Wrangler'ı ilk çalıştırmada kendisi indirir.

> **IIS Express kullanılmaz.** IIS Express sayfaları gösterir ama Worker'ı çalıştırmaz. Bu durumda `/istanbul/atasehir` gibi yollar 404 verir ve bülten kaydı (`/api/subscribe`) çalışmaz.

## Yerelde çalıştırma

Proje klasöründe:

```sh
cp .dev.vars.example .dev.vars    # yalnızca ilk seferde
npx wrangler dev
```

Tarayıcıda:

| Sayfa | Adres |
|-------|-------|
| Ana sayfa | http://localhost:8787/ |
| İl | http://localhost:8787/istanbul |
| İlçe | http://localhost:8787/istanbul/atasehir |
| Mahalle | http://localhost:8787/istanbul/atasehir/kucukbakkalkoy |

Kapatmak için terminalde `Ctrl+C`.

### Yerel ve yayın adresleri

Yerelde sayfalar klasör yoluyla açılır. Yayında her yer kendi subdomain'indedir:

| | Yerel | Yayın |
|---|---|---|
| İl | `localhost:8787/istanbul` | `istanbul.mahalle.si` |
| İlçe | `localhost:8787/istanbul/atasehir` | `atasehir.mahalle.si` |
| Mahalle | `localhost:8787/istanbul/atasehir/kucukbakkalkoy` | `kucukbakkalkoy.mahalle.si` |

Hangi modun kullanılacağını `YONLENDIRME` değişkeni belirler:

- `wrangler.jsonc` içinde `subdomain` (yayın).
- `.dev.vars` içinde `klasor` (yerel). Bu dosya gitignore'dadır, bu yüzden her yeni makinede yukarıdaki `cp` komutuyla bir kez oluşturulmalı.

`.dev.vars` yoksa yerelde de subdomain modu devreye girer ve klasör yolları çalışmaz.

## Sık karşılaşılanlar

- **Değişiklik görünmüyor:** HTML, CSS, JS ya da JSON dosyalarını değiştirdiğinde sayfayı yenilemen yeterli. `wrangler.jsonc` ya da `.dev.vars` değiştiyse `wrangler dev`'i kapatıp yeniden başlat.
- **Sayfa açılmıyor ya da "port kullanımda" hatası:** Arka planda kapanmamış bir `wrangler dev` süreci 8787 portunu tutuyor olabilir. PowerShell'de:
  ```powershell
  Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
  ```
  Ya da başka bir portta başlat: `npx wrangler dev --port 8788`
- **Bülten kaydı 403 dönüyor:** Yerelde bu normal. Turnstile doğrulaması yalnızca `mahalle.si` adresini kabul ediyor.
- **Dosyaya çift tıklayınca sayfa boş geliyor:** Sayfalar veriyi `fetch` ile JSON'dan okuduğu için `file://` üzerinden çalışmaz. Her zaman `wrangler dev` kullan.

## Veri

```
public/data/
├── iller/istanbul.json             # il + 39 ilçe
├── ilceler/atasehir.json           # ilçe + 17 mahalle
├── mahalleler/kucukbakkalkoy.json  # mahalle + rehber kategorileri
└── slugs.json                      # slug → il/ilçe/mahalle haritası (subdomain yönlendirmesi için)
```

- Bir ilçeyi ya da mahalleyi açmak için JSON'da `"aktif": true` yapman yeterli.
- Başka ilçelerde de bulunan mahalle adları `ilce-mahalle` biçiminde slug alır (`atasehir-barbaros`).
- Yeni bir ilçe ya da mahalle eklediğinde `slugs.json` da güncellenmeli.

## Yayına alma

```sh
npx wrangler deploy
```

Yayına almadan önce [roadmap.md](roadmap.md) içindeki "Yayın öncesi kontrol listesi"ni gözden geçir. Subdomain'lerin çalışması için `*.mahalle.si` wildcard DNS kaydı ve route'u henüz eklenmedi.

## Laravel'e geçince

Üyelik aşamasında proje Laravel'e taşınacak. O zaman yerelde `php artisan serve` ya da Laravel Herd kullanılacak. IIS Express yine gerekmeyecek, çünkü o .NET projeleri için.
