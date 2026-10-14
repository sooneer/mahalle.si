# mahalle.si Yol Haritası

> Son güncelleme: 2026-10-11
> Hedef: Türkiye'deki tüm il, ilçe ve mahalleler için yerel rehber. MVP yalnızca **İstanbul** ile sınırlı. İçinde yalnızca **Ataşehir** ilçesi ve **Küçükbakkalköy** mahallesi aktif olacak.

---

## 1. Hedef yapı

```
mahalle.si                      → Ülke ana sayfası (il listesi, MVP'de yalnızca İstanbul aktif)
istanbul.mahalle.si             → İl sayfası, 39 ilçe (Anadolu / Avrupa yakası)
atasehir.mahalle.si             → İlçe sayfası, 17 mahalle (tabela görünümü)
kucukbakkalkoy.mahalle.si       → Mahalle sayfası (eczane, okul, esnaf vb.)
```

### Durum kuralları

| Seviye  | Aktif (tıklanabilir)  | Pasif (⏳ kum saati, tıklanamaz) |
|---------|-----------------------|----------------------------------|
| İl      | İstanbul              | Diğer 80 il |
| İlçe    | Ataşehir              | Kadıköy, Üsküdar, Maltepe ve diğer 35 ilçe |
| Mahalle | Küçükbakkalköy        | Ataşehir'in diğer 16 mahallesi |

- Pasif öğeler görünür ama link değildir (`aria-disabled="true"`). Yanlarında kum saati ikonu ve "Çok yakında" ipucu bulunur.
- Pasif bir subdomain'e doğrudan girilirse 404 yerine "… hazırlanıyor" sayfası ve "Açılınca haber ver" butonu gösterilir.
- **"Eksik mahalle ekle"** yalnızca giriş yapmış kullanıcılara açık olacak (Faz 3). Öneriler moderasyondan sonra yayına alınır.
- Bir ilçeyi ya da mahalleyi açmak **veri değişikliğidir, kod değişikliği değildir** (`"aktif": true`).

### Slug ve subdomain kuralları (karar verildi)

Mahalle adları ilçeler arasında tekrar ediyor. "Barbaros" hem Ataşehir'de hem Üsküdar'da var, "Atatürk" ise onlarca ilçede geçiyor. Tüm il, ilçe ve mahalleler tek seviye subdomain kullanır ve hepsi **tek bir ad alanını paylaşır**.

**Kural:** Adı benzersiz olan mahalle sade slug alır. Başka bir mahalleyle ya da ilçeyle aynı adı taşıyan mahalle **`ilce-mahalle`** biçiminde slug alır.

| Mahalle | Slug | Adres |
|---------|------|-------|
| Küçükbakkalköy (Ataşehir) | `kucukbakkalkoy` | `kucukbakkalkoy.mahalle.si` |
| Barbaros (Ataşehir) | `atasehir-barbaros` | `atasehir-barbaros.mahalle.si` |
| Barbaros (Üsküdar) | `uskudar-barbaros` | `uskudar-barbaros.mahalle.si` |
| Aşıkveysel (Ataşehir) | `atasehir-asikveysel` | `atasehir-asikveysel.mahalle.si` |
| Mustafa Kemal (Ataşehir, İstanbul'da tek) | `mustafa-kemal` | `mustafa-kemal.mahalle.si` |

`data/ilceler/atasehir.json` bu kuralla yazıldı.

Ek kurallar ve öneriler:
- **Öncelik sırası:** il > ilçe > mahalle. Bir mahalle bir il ya da ilçeyle aynı adı taşıyorsa (örneğin başka ilçedeki "Fatih" mahallesi ile Fatih ilçesi), sade slug il/ilçede kalır, mahalle `ilce-mahalle` alır.
- **Yayınlanan slug değişmez.** Sade slug'la yayındaki bir mahalleyle aynı adı taşıyan yeni bir mahalle sonradan eklenirse, yalnızca **yeni gelen** `ilce-mahalle` alır. Eski adresler kırılmaz, SEO kaybı olmaz.
- **Toplu yüklemede çakışma kontrolü:** Slug üretme betiği önce tüm adları sayar, birden fazla geçenlerin hepsine baştan önek verir. Böylece "ilk gelen sade adı kapar" adaletsizliği oluşmaz.
- **Kısa yönlendirme:** Sade ad birden fazla mahalleye karşılık geliyorsa, örneğin `barbaros.mahalle.si`, 404 yerine "Hangi Barbaros?" seçim sayfası gösterir (Ataşehir / Üsküdar ...).
- **Ayrılmış slug'lar:** `www`, `api`, `admin`, `yonetim`, `mail`, `app`, `static`, `cdn` hiçbir yere verilemez.
- **İl ile ilçe çakışması:** İstanbul'da yok, ama ileride 81 il eklenince kontrol edilmeli. Aynı kural uygulanır: ilçe `il-ilce` alır.
- Slug'lar her zaman ASCII, küçük harf ve tireli olacak (`ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u`, boşluk → `-`). Punycode'lu `ataşehir.mahalle.si` kullanılmayacak. Ekranda doğru Türkçe yazım gösterilecek.
- DNS etiketi en fazla 63 karakter olabilir. Betik bu sınırı aşan slug'ları raporlamalı.

Değerlendirilip elenen alternatifler:
- `atasehir.mahalle.si/barbaros` (ilçe subdomain + path): istenen URL biçimiyle uyumsuz.
- `barbaros.atasehir.mahalle.si` (iki seviye): ücretsiz Universal SSL kapsamıyor, Advanced Certificate gerekiyor.

---

## 2. Teknoloji kararı

**Karar: PHP Laravel.** İki aşamada ilerlenecek:

| Aşama | Yığın | Neden |
|-------|-------|-------|
| **MVP (Faz 1)** | Mevcut statik site + **JSON veri dosyaları**, veritabanı yok. Cloudflare Workers Assets. | Okunan veri sabit (il/ilçe/mahalle listesi). Sunucu, bakım ve maliyet yok. Hemen yayına alınabilir. |
| **Üyelik ve katkı (Faz 2+)** | **Laravel 12 + MySQL** (ya da PostgreSQL), Cloudflare önde proxy | Kayıt/giriş, öneri, moderasyon ve admin paneli Laravel'de hazır gelir. |

Laravel'in bu projeye kattıkları:
- `Route::domain('{slug}.mahalle.si')` ile subdomain yönlendirme tek satırda yazılır.
- Breeze ile kayıt, giriş, e-posta doğrulama ve şifre sıfırlama hazır gelir.
- Filament ile moderasyon/admin paneli kurulur ("eksik mahalle" önerilerini onaylama).
- Migration ve seeder ile ~960 İstanbul ve ~32.000 Türkiye mahallesi rahatça yüklenir.
- Rate limit, CSRF, kuyruk ve mail altyapısı hazır gelir.

**MSSQL yerine MySQL/PostgreSQL:** Lisans maliyeti yok, Laravel ile en sorunsuz çalışan veritabanları bunlar.

**Mimari:** Tek Laravel projesiyle başlanır (standart `app/` yapısı). Katmanlı mimariye (Domain / Application / Infrastructure) ancak iş kuralları büyüyüp controller'lar şişince geçilir. Ara adım olarak `app/Services` ve `app/Actions` kullanılır.

> Not: Laravel, şu ana kadarki "paketsiz, build adımsız" yaklaşımdan bilinçli bir sapmadır (Composer, Vite). MVP aşaması bu yüzden hâlâ paketsiz.

---

## 3. Veri modeli

### 3a. MVP: JSON dosyaları (şu an)

```
public/data/
├── iller/istanbul.json            # il + 39 ilçe (ad, slug, yaka, aktif, mahalleSayisi)
├── ilceler/atasehir.json          # ilçe + 17 mahalle (ad, slug, aktif)
└── mahalleler/kucukbakkalkoy.json # mahalle + rehber kategorileri (kayitSayisi: null = hazırlanıyor)
```

Kurallar:
- Dosya adı = slug. Pasif ilçe/mahalle için dosya oluşturulmaz. Sayfa üst seviyedeki listeden adı bulur ve "hazırlanıyor" gösterir.
- `kayitSayisi: null` → kartta "Hazırlanıyor" yazar. **Gerçek veri gelmeden sayı yazılmaz.**
- Bu JSON'lar Faz 2'de Laravel seeder'larının girdisi olur, yani boşa gitmez.

### 3b. Laravel: MySQL tabloları (Faz 2+)

```
provinces        id, name, slug (unique), plate_code, is_active
districts        id, province_id, name, slug (unique), side (anadolu|avrupa), is_active
neighborhoods    id, district_id, name, slug (unique), is_active, source (official|user)
                 unique(district_id, name)
slugs            slug (pk), kind (province|district|neighborhood|reserved), target_id
                 → tüm subdomain'ler tek ad alanında; reserved: www, api, admin, mail, app
users            Laravel varsayılanı + role (user|moderator|admin)
neighborhood_suggestions  id, district_id, name, note, user_id, status (pending|approved|rejected), reviewed_by
categories / listings      Faz 4 (eczane, okul, esnaf kayıtları)
subscribers      mevcut bülten tablosu D1'den taşınır
```

---

## 4. Fazlar

### Faz 0: Hazırlık
- [x] Subdomain çakışma stratejisi: tek seviye, çakışan mahallelerde `ilce-mahalle` (bölüm 1).
- [ ] Git'te silinmiş görünen `schema.sql` geri alınmalı ya da kaldırılması commit'lenmeli (bülten D1 tablosu hâlâ ona bağlı).
- [ ] Cloudflare DNS: `*.mahalle.si` için proxied wildcard kaydı.
- [ ] Turnstile: hostname kontrolü tam `mahalle.si` yerine `.mahalle.si` son ekini de kabul etmeli. Aksi halde alt alan adlarında bülten 403 döner.

### Faz 1: JSON tabanlı MVP (veritabanısız) ← **şu an burada**

**Adresleme: yerelde klasör, yayında subdomain (karar verildi, uygulandı)**

| Ortam | İl | İlçe | Mahalle |
|-------|----|------|---------|
| Yerel (`wrangler dev`) | `localhost:8787/istanbul` | `/istanbul/atasehir` | `/istanbul/atasehir/atasehir-barbaros` |
| Yayın | `istanbul.mahalle.si` | `atasehir.mahalle.si` | `atasehir-barbaros.mahalle.si` |

- Ortamı `YONLENDIRME` değişkeni belirler: `wrangler.jsonc` içinde `subdomain`, yerelde `.dev.vars` içinde `klasor` (`cp .dev.vars.example .dev.vars`). `wrangler dev` hostname'i her istekte `mahalle.si` yaptığı için ortam adresten anlaşılamıyor.
- Yönlendirme `src/worker.js` → `routePlace` içinde yapılıyor. Subdomain modunda slug'ın türü `data/slugs.json`'dan okunur. Bilinmeyen subdomain 404 döner.
- Yayında `mahalle.si/istanbul/atasehir` gibi klasör adresleri, slug zinciri doğruysa ilgili subdomain'e **301** ile yönlendirilir. Paylaşılan eski linkler de böylece çalışır.
- Tarayıcı tarafında `rehber.js` → `placeUrl(il, ilce, mahalle)` aynı kuralla link üretir (yerelde yol, yayında subdomain). Sayfalardaki CSS/JS/görsel yolları mutlaktır (`/styles.css`), her iki modda da çalışır.
- Klasör yolu Laravel'de de korunabilir: geliştirme ortamında `Route::get('/{il}/{ilce?}/{mahalle?}')`, yayında `Route::domain('{slug}.mahalle.si')`.
- Öneri: `data/slugs.json` elle düzenlenmemeli. Slug betiği bunu `iller/` ve `ilceler/` JSON'larından üretmeli ve çakışma varsa hata vermeli.
Prototip sayfalar hazır (`public/` altında):

| Dosya | Ne yapıyor |
|-------|------------|
| `il.html` (`/istanbul`) | İlçeleri Anadolu/Avrupa yakasına göre listeler. Aktif ilçe vurgulu kart olarak, pasifler kum saatiyle gösterilir. Türkçe duyarsız arama içerir. |
| `ilce.html` (`/istanbul/atasehir`) | Mahalleleri sokak tabelası biçiminde listeler. Açık olan lacivert, pasifler soluk ve kum saatli. "Eksik mahalle ekle" kutusu var. |
| `mahalle.html` (`/istanbul/atasehir/kucukbakkalkoy`) | Mahalle tabelası, kırıntı yolu, rehber kategorileri ("Hazırlanıyor"), katkı akışı ve diğer mahalleler bölümleri. |
| `rehber.js` / `rehber.css` | Ortak render, filtre, Türkçe ek üretimi (`Ataşehir'in`, `Küçükbakkalköy'de`), toast. |

Kalan işler:
- [x] Worker yönlendirmesi: yerelde klasör yolu, yayında subdomain (`routePlace`, `data/slugs.json`).
- [x] `rehber.js` → `placeUrl` ortama göre link üretiyor.
- [x] `run_worker_first` HTML isteklerini Worker'a alıyor (`/data`, `/img`, `.css`, `.js` hariç).
- [ ] `wrangler.jsonc` `routes` içine `{ "pattern": "*.mahalle.si/*", "zone_name": "mahalle.si" }` eklenmeli (wildcard DNS kaydıyla birlikte, yayından hemen önce).
- [ ] Ana sayfa (`index.html`) ülke sayfasına dönüşmeli: il listesi, yalnızca İstanbul aktif. Mevcut Ataşehir içeriği `mahalle.html`'e taşındı.
  - Öneri (karar bekliyor): Üç katmanlı giriş. (1) **"Mahalleni yaz" araması** en üstte, Türkçe duyarsız. "Küçükbakkalköy" yazınca doğrudan mahalleye gider, ara adım olmaz. Kaynak: `ilce-mahalle.json`'dan üretilen küçük bir arama dizini (ad, ilçe, slug, aktif). (2) **81 il listesi** plaka koduna ya da alfabeye göre, İstanbul öne çıkarılmış kart, diğerleri kum saatli. Mobilde birincil yol bu. (3) **Türkiye SVG haritası** masaüstünde listenin yanında, mobilde gizli ya da küçük. İstanbul turkuaz, diğer iller gri. Kaynak: Wikimedia Commons ya da OSM `admin_level=4` + mapshaper (bkz. SVG harita önerisi), lisans/atıf kontrol edilmeli.
  - Harita tek başına yeterli değil: küçük iller (Kilis, Yalova, Bartın) mobilde parmakla seçilemez, ekran okuyucuyla kullanılamaz. Liste her zaman olmalı.
  - Sonra: "Konumumu kullan" butonu. Konumu mahalle sınırlarıyla eşleştirir (SVG harita için indirilen poligonlar kullanılır).
    - Yöntem: tarayıcıda point-in-polygon (ışın atma, ~20 satır, paketsiz). Konum sunucuya gönderilmez (KVKK açısından en temiz yol). İl başına sınır dosyası yalnızca butona basılınca yüklenir.
    - Poligon gelene kadar geçici yol: en yakın eczanenin mahallesi (`eczaneler` verisinde konum ve `neighborhoodId` var). Sınıra yakın yerlerde yanılabilir.
    - Sonuç her zaman onaya sunulur: "Küçükbakkalköy'de misin? Evet / Başka mahalle seç". Konum izni yalnızca butona basınca istenir.
    - [x] Uygulandı (Ataşehir): ana sayfada "Konumumla bul" butonu, izin önceden verildiyse sorulmadan öneri, "Son baktığın" kısayolu. Sınırlar `node scripts/sinir-yayinla.js` ile `public/data/sinirlar/` altına üretilir (`index.json` ilçe kutuları + ilçe başına poligon, Ataşehir 33 KB). Eşleştirme tarayıcıda, 172/172 eczane testi geçti. Footer'a OSM atfı eklendi.
    - [ ] Yeni ilçe açıldıkça: `mahalle-sinir.js <İLÇE>` → `sinir-yayinla.js`.
    - Karar: buton, otomatik yönlendirme yok. Sayfa açılışında izin istenmez (Chrome bunu sessiz izin arayüzüne düşürüyor, kullanıcı reddediyor). İzin daha önce verildiyse (`navigator.permissions.query`) sorulmadan "Küçükbakkalköy'desin gibi görünüyor → Git" önerisi gösterilir. Son seçilen mahalle `localStorage`'da tutulur, dönüşte "Son baktığın: …" kısayolu çıkar.
    - Elenen: Nominatim ters geocoding. Kullanım sınırı (1 istek/sn) var, Türkiye'de mahalle alanı tutarsız geliyor ve konum üçüncü tarafa gider.
- [ ] İstanbul'un tüm mahallelerini içeren JSON'lar (yalnızca ad/slug, hepsi pasif). Kaynak: İçişleri Bakanlığı / TÜİK ADNKS. Lisans kontrol edilmeli.
- [ ] Slug üretme ve çakışma raporlama betiği (`ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u`).
- [ ] SEO: `<title>`, `canonical`, yalnızca aktif sayfaları içeren `sitemap.xml`, pasif sayfalarda `noindex`.
- [ ] Bülten formu mahalle sayfasına eklenmeli (hangi mahalleden kayıt olunduğu bilgisiyle).

### Faz 2: Laravel'e geçiş (okuma tarafı)
- [ ] `composer create-project laravel/laravel mahalle-si` (ayrı repo ya da `app/` klasörü).
- [ ] Hosting seçimi: Laravel Cloud, Forge + Hetzner/DigitalOcean ya da Ploi. Cloudflare DNS ve proxy önde kalır, wildcard SSL Cloudflare'de sonlanır.
- [ ] Migration'lar (bölüm 3b) ve **JSON dosyalarını okuyan seeder'lar**.
- [ ] Rotalar:
  ```php
  Route::domain('mahalle.si')->group(...);                // ülke sayfası, giriş, kayıt, hesabım
  Route::domain('{slug}.mahalle.si')->get('/', PlaceController::class); // slugs tablosuna göre il/ilçe/mahalle
  ```
- [ ] `PlaceController`: slug → tür → `il`, `ilce`, `mahalle` Blade view'ı ya da "hazırlanıyor" sayfası.
- [ ] Blade: `layouts/app.blade.php` (header, footer, sprite), `components/plaka`, `components/crumbs`, `components/soon`. Prototipteki HTML/CSS neredeyse aynen taşınır, `rehber.js`'teki render mantığı Blade'e geçer, JS yalnızca filtre ve toast için kalır.
- [ ] Türkçe ekler için `app/Support/Turkish.php` (`bulunma`, `tamlayan`). `rehber.js`'teki mantığın PHP karşılığı.
- [ ] Önbellek: liste sayfaları için `Cache::remember` ve Cloudflare cache kuralı.
- [ ] Bülten aboneleri D1'den MySQL'e taşınmalı, Turnstile doğrulaması Laravel'e alınmalı.

### Faz 3: Üyelik ve "Eksik mahalle ekle"
- [ ] Laravel Breeze (Blade). E-posta doğrulama zorunlu.
- [ ] Oturum cookie'si tüm alt alan adlarında geçerli olmalı: `.env` içinde `SESSION_DOMAIN=.mahalle.si`.
- [ ] Kayıt ve giriş formlarına Turnstile eklenmeli, `RateLimiter` ile sınırlanmalı.
- [ ] İlçe sayfasındaki "Eksik mahalle ekle" kutusu giriş yapmamış kullanıcıyı girişe yönlendirmeli, giriş yapmış kullanıcıya formu açmalı.
- [ ] `neighborhood_suggestions`: aynı ilçede aynı ada sahip mahalle ya da bekleyen öneri varsa reddedilir. Kullanıcı başına günlük öneri sınırı konur.
- [ ] Filament admin paneli (`/yonetim`, `role = admin|moderator`). Onaylanan öneri için `neighborhoods` ve `slugs` kaydı oluşturulur (`source = user`, `is_active = 0`).
- [ ] Karar sonucu kullanıcıya e-postayla bildirilir (Laravel Notification).
- [ ] KVKK: aydınlatma metni, açık rıza onay kutusu, hesap silme.

### Faz 4: Küçükbakkalköy içerikleri
- [ ] "24 Okul", "18 Mağaza" gibi **yer tutucu sayılar** gerçek verilerle değiştirilmeli. Bunlar düzeltilmeden yayına alınmamalı.
- [ ] `categories` ve `listings` tabloları. Nöbetçi eczane için resmi kaynak entegrasyonu.
- [ ] "Bilgi öner" akışı Faz 3'teki öneri + moderasyon modelini yeniden kullanır.

### Öneri: Telefondan mekan ekleme (Cloudflare + GitHub, Laravel'siz alternatif)
Önerildi, karar bekliyor. Bölüm 2'deki Laravel kararına alternatif olarak değerlendirilmeli.
- [ ] **Akış:** Telefondaki form (`/ekle`, PWA) → `POST /api/places` (Worker: Turnstile + doğrulama) → D1 `places` tablosuna `status = 'pending'` ile yazılır. Fotoğraf R2'ye yüklenir.
- [ ] **Onay:** `/yonetim` sayfası Cloudflare Access ile korunur (yalnızca yöneticinin e-postası, kod yazmadan giriş). Onaylanan kayıt `status = 'approved'` olur ve mahalle sayfası bunu `GET /api/places?mahalle=...` ile okur.
- [ ] **Şema:** `places(id, mahalle_slug, kategori, ad, adres, telefon, lat, lng, foto_key, status, kaynak, created_at, approved_at)`.
- [ ] **GitHub'ın rolü:** Kod deposu ve Workers Builds ile otomatik deploy (`main`'e push → yayın). Opsiyonel: haftalık GitHub Action D1'den JSON yedeği alıp repoya commit'ler (veri geçmişi ve yedek).
- [ ] Elenen alternatif: veriyi doğrudan GitHub'da tutmak (form → GitHub API → PR → merge → deploy). Kurulumu kolay ama her ekleme bir deploy ister, token Worker'da saklanmalı ve kullanıcı katkısı ölçeklenmez. Yalnızca tek kişilik giriş için uygun.

### Öneri: İlçe ve mahalle sayfalarında SVG harita
Önerildi, karar bekliyor.
- [ ] **Kaynak:** OpenStreetMap sınırları (`admin_level=6` ilçe; mahalle Türkiye'de genelde `admin_level=8`, bazı yerlerde `10`, indirirken kontrol edilmeli). Overpass Turbo ya da osm-boundaries.com'dan GeoJSON indirilir. Lisans ODbL, sayfada "© OpenStreetMap katkıcıları" yazılmalı. Mahalle sınırlarının eksik ya da hatalı olabileceği kontrol edilmeli.
  - [x] Ataşehir: 17/17 mahalle sınırı indirildi (`scripts/mahalle-sinir.js`, `data/osm-atasehir.geojson`). Overpass yoğun olduğu için Nominatim ters sorgusu kullanıldı. Mahalleler OSM'de `boundary=administrative` ilişkisi olarak var, adlar resmi listeyle birebir eşleşiyor.
- [ ] **Dönüştürme (tek seferlik, yerelde):** `npx mapshaper` ile sadeleştir (`-simplify 5%`), her `path`'e `id=slug` ver ve SVG'ye aktar. Çıktılar `public/img/harita/istanbul.svg`, `public/img/harita/atasehir.svg`. Projeye paket eklenmez.
- [ ] **Kullanım:** İlçe sayfasında İstanbul haritası, aktif ilçe turkuaz renkte, diğerleri gri. Mahalle sayfasında ilçe haritası, mevcut mahalle vurgulu. Path'e tıklanınca `placeUrl` ile ilgili sayfaya gidilir, pasif alanlar kum saati ipucu gösterir. Renkler CSS token'larından alınır.
- [ ] **Mekan noktaları (sonra):** D1'deki `lat/lng` ile SVG üzerine nokta basılır. Sokak düzeyinde harita gerekirse Leaflet/MapLibre + OSM karoları değerlendirilir (cdnjs'ten, build'siz).
- [ ] Elenen alternatif: Google Maps. API anahtarı ve faturalandırma gerektiriyor, mahalle sınırı poligonu sunmuyor, sitenin tasarımına uydurulamıyor ve sayfayı ağırlaştırıyor.

### Öneri: Eczane verisi (`data/eczane.json`)
Kaynak dosya: İstanbul'daki 5.934 eczane (GeoJSON), Ataşehir'de 172, Küçükbakkalköy'de 24. Ham dosyalar `data/` altında, gitignore'da.
- [x] Tüm İstanbul tek seferde işlenir, ama yalnızca aktif mahalleler yayında gösterilir. Bir mahalleyi açmak yine yalnızca veri değişikliği olur.
- [x] Betik `node scripts/eczane-bol.js`: `neighborhoodId` → `ilce-mahalle.json` `KIMLIKNO` eşlemesiyle 753 dosya üretir (`public/data/eczaneler/<mahalle-slug>.json`, toplam ~1 MB). Yalnızca ad, adres, telefon ve konum tutulur. Yayındaki slug'lar ilçe JSON'undan alınır.
- [x] Küçükbakkalköy kartı: "Eczaneler", 24 kayıt (gerçek veri).
- [ ] Ümraniye/Saray (`neighborhoodId` 98701) mahalle listesinde yok, 9 eczanesi dışarıda kaldı. Güncel mahalle listesi alınmalı.
- [x] `atasehir.json` ve `slugs.json` slug'ları resmi listeye göre düzeltildi: `asikveysel` → `atasehir-asikveysel`, `ferhatpasa` → `atasehir-ferhatpasa`, `ornek` → `atasehir-ornek`, `atasehir-mustafa-kemal` → `mustafa-kemal`, `yeni-sahra` → `yenisahra`, `atasehir-mimarsinan` → `atasehir-mimar-sinan`. Ekrandaki adlar resmi yazıma çekildi ("Yenisahra", "Mimar Sinan").
- [x] Mahalle sayfasında eczane listesi (`#eczaneler`): ad, adres, telefon (`tel:`), yol tarifi. Kart listeye kayar.
- [ ] Eczane konumlarını SVG haritada nokta olarak göstermek.
  - [x] Uygulandı: Küçükbakkalköy eczane bölümünde MapLibre GL 4.7.1 (jsDelivr) + OpenFreeMap `positron` haritası; mahalle sınırı kesikli turkuaz, eczaneler kırmızı nokta, tıklayınca ad/adres/telefon. Kütüphane (~800 KB) bölüm görünüme yaklaşınca yüklenir. OpenFreeMap vektör karo verdiği için Leaflet yerine MapLibre seçildi.
  - İlk öneri: sokak haritası gerekirse **Leaflet (cdnjs) + OpenFreeMap** karoları. Ücretsiz, API anahtarı ve kart gerekmez, build'siz. Trafik büyürse Protomaps PMTiles dosyası R2'de barındırılır (kendi karomuz, dış bağımlılık yok). "Yol tarifi" butonu Google Maps linki olarak kalır.
  - Elenen: Google Maps JavaScript API. Ücretsiz kota var ama faturalandırma hesabı (kredi kartı) zorunlu, kota aşılınca ücret çıkar, Google çerezleri KVKK/çerez onayı gerektirir. Maps Embed API ücretsiz ama kendi pinlerimizi koyamıyoruz (yalnızca Google'ın kendi aramasını gösterir). Google My Maps ücretsiz ama elle güncellenir.
- [ ] `nightDuty`, `openingHour` ve `closingHour` alanları anlık veridir, statik dosyada bayatlar. Nöbetçi eczane bilgisi canlı kaynaktan (Worker + cache) çekilmeli.
- [ ] Kaynağın lisansı (İBB Açık Veri?) ve atıf koşulu kontrol edilmeli.

### Öneri: Okul verisi (adres → konum)
Kaynak: il geneli özel okul listesi (HTML tablo: ilçe, ad, tür, adres, telefon; konum yok). Şimdilik yalnızca Ataşehir (163 okul) işleniyor, Küçükbakkalköy (35 okul) yayında.
- [x] **Mahalle adresten okunur, konumdan değil.** `scripts/okul-donustur.js`: "MAH.", "MAHALLESİ", "MAHHALLESİ" ve başında ilçe adı olan biçimler ("ATAŞEHİR FERHATPAŞA MAH.") tanınıyor. Çıktı `public/data/okullar/<mahalle>.json`, yayınlanacak mahalleler betikteki `MAHALLELER` dizisinde.
- [ ] Mahalle adları henüz `ilce-mahalle.json` ile eşleştirilmiyor, yalnızca adres metni kullanılıyor. Başka mahalle açılırken eklenmeli.
- [x] **Harita pini için geocoding:** `scripts/okul-konum.js` Nominatim ile sırayla okul adı → sokak + kapı no → yalnızca sokak dener. Küçükbakkalköy: 24 okul bina düzeyinde, 11 okul yalnızca sokak düzeyinde bulundu.
- [x] **Doğrulama:** Mahalle sınırı dışındaki sonuç atılır. Ad eşleşmesinde OSM adının ayırt edici kelimelerinin hepsi okul adında geçmeli ("Beyaz İnci" ≠ "Beyaz"). Zincir okulun farklı sokaktaki şubesi, adresindeki sokağa 150 m'den uzaksa kampüse bağlanmaz. Sonuçlar `data/okul-konum.json`'da saklanır, elle düzeltilebilir.
- [x] Okullar sayfası (`kucukbakkalkoy.mahalle.si/okullar`): harita (sokak düzeyindekiler içi boş daire), kademe süzgeci (Anaokulu, İlkokul, Ortaokul, Lise), telefon ve yol tarifi. Ana sayfadaki "Özel Okullar" kartı ve popüler kart (35 Okul) bu sayfaya bağlı.
- [x] Eczaneler ve okullar ayrı sayfalara taşındı (`/eczaneler`, `/okullar`, `kategori.html`). Mahalle sayfası artık yalnızca kategori kartlarını gösteriyor, harita kütüphanesini (~800 KB) yüklemiyor. Eski `#eczaneler` / `#okullar` bağlantıları yeni sayfaya yönlendiriliyor.
- [ ] Kart sayıları (`kayitSayisi`) mahalle JSON'unda. `okul-donustur.js` okul ve devlet okulu sayılarını kendisi güncelliyor; `eczane-bol.js` henüz güncellemiyor.
- [ ] Sokak düzeyindeki 11 okulun konumu elle doğrulanmalı. `data/` gitignore'da olduğu için `okul-konum.json` düzeltmeleri repoya girmiyor, kalıcı olması için dosya repoya alınmalı.
- [x] Devlet okulları: `data/devlet-okul.json` (89 Ataşehir okulu, HOST + YOL) → `scripts/devlet-okul-topla.js` okulların MEB sitelerinden konum (`tema/harita.php`), telefon ve adres (`okulumuz_hakkinda.html`, iki farklı şablon) toplar. Sayfa: `kucukbakkalkoy.mahalle.si/devlet-okullari`. Mahalle adresten, adres yoksa konumun düştüğü OSM sınırından bulunur.
- [ ] Devlet okullarında kayıt bölgesi (adrese dayalı kayıt) bilgisi yok. Veliler için en önemli bilgi bu, kaynak araştırılmalı.
- [ ] Elenen: Google Geocoding API. Kullanım şartları sonucun Google dışı haritada (MapLibre) gösterilmesini ve kalıcı saklanmasını yasaklıyor.
- [ ] Kaynağın kullanım koşulları (MEB?) kontrol edilmeli. Adresler dış servise gönderilmeden önce onay alınmalı.

### Faz 5: Genişleme
- [ ] Ataşehir'in diğer mahalleleri sırayla açılır (yalnızca `is_active` güncellemesi).
- [ ] Komşu ilçeler (Kadıköy, Üsküdar...) açılır.
- [ ] 81 il verisi yüklenir.
- [ ] Gerekirse katmanlı mimariye geçilir (bölüm 2).

---

## 5. Yayın öncesi kontrol listesi
- [ ] Yer tutucu sayılar kaldırıldı mı?
- [ ] Turnstile hostname kontrolü alt alan adlarında çalışıyor mu?
- [ ] Pasif subdomain'ler 404 yerine "hazırlanıyor" sayfası gösteriyor mu?
- [ ] Mobil (390px), `prefers-reduced-motion` ve klavye erişimi kontrol edildi mi?
- [ ] KVKK metinleri yayında mı?
- [ ] `wrangler deploy` yalnızca açıkça onay alındıktan sonra çalıştırılacak.
