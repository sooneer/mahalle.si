// MEB özel okul listesini (HTML tablo) JSON'a çevirir, Ataşehir okullarını alır.
// Girdi:  data/ozel-okul.html
// Çıktı:  data/ozel-okul.json (Ataşehir'in tamamı)
//         public/data/okullar/<mahalle-slug>.json (yalnızca MAHALLELER içindekiler)
// Konumlar: data/okul-konum.json (scripts/okul-konum.js)
//         public/data/devlet-okullari/<mahalle-slug>.json (data/devlet-okul-meb.json varsa)
// Kullanım: node scripts/okul-donustur.js

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(KOK, "data/ozel-okul.html"), "utf8");

const ILCE = "ATAŞEHİR";
// Şimdilik yalnızca bu mahalleler yayınlanır.
const MAHALLELER = ["KÜÇÜKBAKKALKÖY"];

const ASCII = { ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u", â: "a", î: "i", û: "u" };
const slugify = (s) =>
  s.toLocaleLowerCase("tr-TR")
    .replace(/[ışçğöüâîû]/g, (c) => ASCII[c])
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const temizle = (s) =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const govde = html.slice(html.indexOf("<tbody>"));
const okullar = [];

for (const [, satir] of govde.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
  const hucreler = [...satir.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (hucreler.length < 6) continue;

  const [, ilce, ad, tur, adresHtml, telHtml] = hucreler;
  const ilceAdi = temizle(ilce);
  if (ilceAdi !== ILCE) continue;

  const adres = temizle(adresHtml);
  // "ATAŞEHİR FERHATPAŞA MAH." gibi ilçe adıyla başlayan adreslerde ilçe atılır.
  const mahalle = adres.match(/^(.+?) MAH+(?:\.|ALLESİ)/)?.[1].replace(ilceAdi + " ", "") ?? null;
  const tel = telHtml.match(/href="tel:(\d+)"/)?.[1];

  okullar.push({
    ilce: ilceAdi,
    mahalle,
    ad: temizle(ad),
    tur: temizle(tur),
    adres,
    telefon: tel ? "+90" + tel : null,
  });
}

fs.writeFileSync(path.join(KOK, "data/ozel-okul.json"), JSON.stringify(okullar, null, 2) + "\n");
console.log(`${okullar.length} ${ILCE} okulu → data/ozel-okul.json`);

// scripts/okul-konum.js çıktısı. "sokak" kaynaklı konum yalnızca sokağın orta noktasıdır, okulun yeri değil.
const konumDosyasi = path.join(KOK, "data/okul-konum.json");
const konumlar = fs.existsSync(konumDosyasi) ? JSON.parse(fs.readFileSync(konumDosyasi, "utf8")) : {};

const cikis = path.join(KOK, "public/data/okullar");
fs.mkdirSync(cikis, { recursive: true });
for (const mahalle of MAHALLELER) {
  const slug = slugify(mahalle);
  const liste = okullar
    .filter((o) => o.mahalle === mahalle)
    .map(({ ad, tur, adres, telefon }) => {
      const k = konumlar[ad];
      return {
        ad, tur, adres, telefon,
        konum: k?.konum ?? null, // [enlem, boylam]
        konumHassasiyeti: k?.konum ? (k.kaynak === "sokak" ? "sokak" : "bina") : null,
      };
    })
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  fs.writeFileSync(path.join(cikis, `${slug}.json`),
    `{"mahalle":${JSON.stringify(slug)},"okullar":[\n${liste.map((o) => JSON.stringify(o)).join(",\n")}\n]}\n`);
  console.log(`${liste.length} okul → public/data/okullar/${slug}.json`);
}

// --- Devlet okulları -----------------------------------------------------------
// scripts/devlet-okul-topla.js çıktısı (okulların MEB sitelerinden). Konum MEB'in harita sayfasından, bina düzeyinde.
// Mahalle adresten okunur; adres yoksa ya da mahalle yazmıyorsa konumun düştüğü OSM mahalle sınırından bulunur.
const mebDosyasi = path.join(KOK, "data/devlet-okul-meb.json");
if (fs.existsSync(mebDosyasi)) {
  const meb = Object.values(JSON.parse(fs.readFileSync(mebDosyasi, "utf8")));
  const sinirlar = JSON.parse(fs.readFileSync(path.join(KOK, "data/osm-atasehir.geojson"), "utf8")).features;
  const halkada = ([x, y], halka) => {
    let ic = false;
    for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
      const [xi, yi] = halka[i], [xj, yj] = halka[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
    }
    return ic;
  };
  const sinirdanMahalle = ([enlem, boylam]) => sinirlar.find((f) =>
    (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
      .some(([dis, ...delikler]) => halkada([boylam, enlem], dis) && !delikler.some((d) => halkada([boylam, enlem], d))))?.properties.ad ?? null;
  const buyuk = (s) => s.toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
  const mahalleler = sinirlar.map((f) => f.properties.ad);
  // "Yenişehir mah." / "Örnek Mah." / "Yenişehir Mahallesi," → resmi ad ("YENİŞEHİR")
  const adrestenMahalle = (adres) => {
    const ham = adres?.match(/^(.+?)\s+MAH/i)?.[1];
    return ham ? mahalleler.find((m) => buyuk(ham).endsWith(buyuk(m))) ?? null : null;
  };

  // Harita sayfası boş olan okul, adresi birebir aynı olan kardeş okulun (aynı bina) konumunu alır.
  const adresAnahtari = (a) => (a ?? "").toLocaleUpperCase("tr-TR").replace(/[^\p{L}\d]/gu, "");
  const adresKonumu = new Map(meb.filter((o) => o.konum && o.adres).map((o) => [adresAnahtari(o.adres), o.konum]));
  for (const o of meb) if (!o.konum) o.konum = adresKonumu.get(adresAnahtari(o.adres)) ?? null;

  const uyumsuz = [];
  const devlet = meb.map((o) => {
    const adrestenM = adrestenMahalle(o.adres);
    const konumdanM = o.konum ? sinirdanMahalle(o.konum) : null;
    if (adrestenM && konumdanM && adrestenM !== konumdanM) uyumsuz.push(`${o.ad}: adres ${adrestenM}, konum ${konumdanM}`);
    return { ...o, mahalle: adrestenM ?? konumdanM };
  });

  const devletCikis = path.join(KOK, "public/data/devlet-okullari");
  fs.mkdirSync(devletCikis, { recursive: true });
  for (const mahalle of MAHALLELER) {
    const slug = slugify(mahalle);
    const liste = devlet
      .filter((o) => o.mahalle === mahalle)
      // Kademe sitede addan bulunur ("Ali Fuat Cebesoy İlkokulu"), bu yüzden tur alanı ad.
      .map(({ ad, adres, telefon, konum }) => ({ ad, tur: ad, adres, telefon, konum, konumHassasiyeti: konum ? "bina" : null }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    fs.writeFileSync(path.join(devletCikis, `${slug}.json`),
      `{"mahalle":${JSON.stringify(slug)},"okullar":[\n${liste.map((o) => JSON.stringify(o)).join(",\n")}\n]}\n`);
    console.log(`${liste.length} devlet okulu → public/data/devlet-okullari/${slug}.json`);
  }
  const mahallesiz = devlet.filter((o) => !o.mahalle).map((o) => o.ad);
  if (mahallesiz.length) console.log(`\nMahallesi bulunamayan ${mahallesiz.length} devlet okulu:\n  ` + mahallesiz.join("\n  "));
  if (uyumsuz.length) console.log(`\nAdresi ile konumu farklı mahallede olan ${uyumsuz.length} devlet okulu (adres esas alındı):\n  ` + uyumsuz.join("\n  "));
}

// --- Kart sayıları -------------------------------------------------------------
// Mahalle sayfası liste dosyalarını yüklemez; kategori kartındaki sayı mahalle JSON'undan okunur.
for (const mahalle of MAHALLELER) {
  const slug = slugify(mahalle);
  const dosya = path.join(KOK, "public/data/mahalleler", `${slug}.json`);
  if (!fs.existsSync(dosya)) continue;
  let metin = fs.readFileSync(dosya, "utf8");
  for (const [id, klasor] of [["okul", "okullar"], ["devlet-okul", "devlet-okullari"]]) {
    const liste = path.join(KOK, "public/data", klasor, `${slug}.json`);
    if (!fs.existsSync(liste)) continue;
    const sayi = JSON.parse(fs.readFileSync(liste, "utf8")).okullar.length || null;
    // Dosyanın elle düzenlenmiş biçimi bozulmasın diye yalnızca o satırdaki sayı değiştirilir
    metin = metin.replace(new RegExp(`("id": "${id}",[^\n]*"kayitSayisi": )(null|\d+)`), `$1${sayi}`);
  }
  fs.writeFileSync(dosya, metin);
}
