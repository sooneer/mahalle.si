// MEB özel okul listesini (HTML tablo) JSON'a çevirir, Ataşehir okullarını alır.
// Girdi:  data/ozel-okul.html
// Çıktı:  data/ozel-okul.json (Ataşehir'in tamamı)
//         public/data/okullar/<mahalle-slug>.json (yalnızca MAHALLELER içindekiler)
// Konumlar: data/okul-konum.json (scripts/okul-konum.js)
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
