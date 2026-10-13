// İstanbul eczane verisini mahallelere böler.
// Girdi:  data/eczane.json (GeoJSON), data/ilce-mahalle.json (ilçe → mahalle, KIMLIKNO)
// Çıktı:  public/data/eczaneler/<mahalle-slug>.json
// Kullanım: node scripts/eczane-bol.js
//
// Nöbet ve açılış saatleri anlık veridir, bilerek alınmaz.

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const oku = (p) => JSON.parse(fs.readFileSync(path.join(KOK, p), "utf8"));

const ASCII = { ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u", â: "a", î: "i", û: "u" };
const slugify = (s) =>
  s.toLocaleLowerCase("tr-TR")
    .replace(/[ışçğöüâîû]/g, (c) => ASCII[c])
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
// "Yeni Sahra" ile "YENİSAHRA" aynı mahalle sayılsın diye boşluksuz karşılaştırılır.
const sikistir = (s) => slugify(s).replace(/-/g, "");

const ilceler = oku("data/ilce-mahalle.json");
const eczaneler = oku("data/eczane.json").features;

// Slug kuralı (roadmap bölüm 1): adı başka bir mahalle ya da ilçeyle çakışan mahalle `ilce-mahalle` alır.
const adSayisi = new Map();
const say = (ad) => adSayisi.set(sikistir(ad), (adSayisi.get(sikistir(ad)) || 0) + 1);
for (const ilce of ilceler) {
  say(ilce.AD);
  for (const m of ilce.NEIGHBORHOODS) say(m.AD);
}

// Yayındaki slug'lar değişmez: ilçe JSON'u varsa slug oradan alınır.
const mahalleler = new Map(); // KIMLIKNO → { slug, ilceSlug }
const uyumsuz = [];
for (const ilce of ilceler) {
  const ilceSlug = slugify(ilce.AD);
  const ilceDosyasi = path.join(KOK, "public/data/ilceler", `${ilceSlug}.json`);
  const yayinda = fs.existsSync(ilceDosyasi)
    ? new Map(JSON.parse(fs.readFileSync(ilceDosyasi, "utf8")).mahalleler.map((m) => [sikistir(m.ad), m.slug]))
    : new Map();

  for (const m of ilce.NEIGHBORHOODS) {
    const kural = adSayisi.get(sikistir(m.AD)) > 1 ? `${ilceSlug}-${slugify(m.AD)}` : slugify(m.AD);
    const mevcut = yayinda.get(sikistir(m.AD));
    if (mevcut && mevcut !== kural) uyumsuz.push(`${ilce.AD}/${m.AD}: kural ${kural}, yayında ${mevcut}`);
    if (yayinda.size && !mevcut) uyumsuz.push(`${ilce.AD}/${m.AD}: ${ilceSlug}.json içinde yok`);
    mahalleler.set(m.KIMLIKNO, { slug: mevcut || kural, ilceSlug });
  }
}

const gruplar = new Map();
const eslesmeyen = [];
for (const { geometry, properties: p } of eczaneler) {
  const m = mahalleler.get(p.neighborhoodId);
  if (!m) { eslesmeyen.push(`${p.pharmacyName} (${p.districtName}/${p.neighborhoodName}, ${p.neighborhoodId})`); continue; }
  if (!gruplar.has(m.slug)) gruplar.set(m.slug, []);
  gruplar.get(m.slug).push({
    id: p.pharmacyId,
    ad: p.pharmacyName,
    adres: p.address,
    telefon: p.phoneNumber || null,
    konum: [geometry.coordinates[1], geometry.coordinates[0]], // [enlem, boylam]
  });
}

const cikis = path.join(KOK, "public/data/eczaneler");
fs.rmSync(cikis, { recursive: true, force: true });
fs.mkdirSync(cikis, { recursive: true });
for (const [slug, liste] of gruplar) {
  liste.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  fs.writeFileSync(path.join(cikis, `${slug}.json`), 
    `{"mahalle":${JSON.stringify(slug)},"eczaneler":[\n${liste.map((e) => JSON.stringify(e)).join(",\n")}\n]}\n`);
}

const uzun = [...mahalleler.values()].filter((m) => m.slug.length > 63).map((m) => m.slug);
console.log(`${eczaneler.length} eczane, ${gruplar.size} mahalle dosyası yazıldı.`);
if (eslesmeyen.length) console.log(`\nMahallesi bulunamayan ${eslesmeyen.length} eczane:\n  ` + eslesmeyen.join("\n  "));
if (uyumsuz.length) console.log(`\nSlug uyumsuzlukları:\n  ` + uyumsuz.join("\n  "));
if (uzun.length) console.log(`\n63 karakteri aşan slug'lar:\n  ` + uzun.join("\n  "));
