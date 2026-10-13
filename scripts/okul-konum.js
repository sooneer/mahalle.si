// Okulların konumunu OpenStreetMap'ten (Nominatim) bulur.
// Sırayla dener: okul adı → sokak + kapı no → yalnızca sokak. Sonuç mahalle sınırı dışındaysa atılır.
// Girdi:  data/ozel-okul.json, data/osm-atasehir.geojson (mahalle sınırları)
// Çıktı:  data/okul-konum.json (ad → { konum, kaynak, osm }). Elle düzeltilebilir: konumu olan okullar yeniden sorgulanmaz.
// Kullanım: node scripts/okul-konum.js KÜÇÜKBAKKALKÖY   (sonra node scripts/okul-donustur.js)
// Veri © OpenStreetMap katkıcıları, ODbL.

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const oku = (p) => JSON.parse(fs.readFileSync(path.join(KOK, p), "utf8"));
const mahalleAdi = (process.argv[2] || "").toLocaleUpperCase("tr-TR");
if (!mahalleAdi) { console.error("Mahalle adı gerekli: node scripts/okul-konum.js KÜÇÜKBAKKALKÖY"); process.exit(1); }

const sinir = oku("data/osm-atasehir.geojson").features.find((f) => f.properties.ad === mahalleAdi);
if (!sinir) { console.error(`${mahalleAdi} osm-atasehir.geojson içinde yok.`); process.exit(1); }
const halkalar = sinir.geometry.type === "Polygon" ? [sinir.geometry.coordinates] : sinir.geometry.coordinates;

// Ray casting; delikler (iç halkalar) de sayıldığı için tek/çift kuralı yeterli.
const icinde = ([x, y]) => halkalar.some((poligon) =>
  poligon.reduce((ic, halka) => {
    for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
      const [xi, yi] = halka[i], [xj, yj] = halka[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
    }
    return ic;
  }, false));

const tum = halkalar.flat(2);
const viewbox = [
  Math.min(...tum.map((p) => p[0])), Math.max(...tum.map((p) => p[1])),
  Math.max(...tum.map((p) => p[0])), Math.min(...tum.map((p) => p[1])),
].join(",");

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "mahalle.si/0.1 (https://mahalle.si)"; // Nominatim kullanım kuralı: tanımlayıcı User-Agent, saniyede en fazla 1 istek

async function ara(q, uygun = () => true, geometri = false) {
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q, format: "jsonv2", limit: "10", countrycodes: "tr", viewbox, bounded: "1", addressdetails: "1",
    ...(geometri && { polygon_geojson: "1" }),
  });
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
  await bekle(1100);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).find((r) => icinde([+r.lon, +r.lat]) && uygun(r));
}

const kucuk = (s) => s.toLocaleLowerCase("tr-TR");
// Ad karşılaştırmasında sayılmayan kelimeler: tür, kurum ve yer adları.
const GENEL = new Set(("özel anaokulu ilkokulu ortaokulu anadolu lisesi lise koleji kolej okulu okulları kurumları " +
  "eğitim yerleşkesi kampüsü kampüs ataşehir istanbul ve").split(" "));
const kelimeler = (s) => kucuk(s).replace(/[^\p{L}\d\s]/gu, " ").split(/\s+/).filter((k) => k && !GENEL.has(k));
// "ÖZEL ATAŞEHİR UĞUR ANADOLU LİSESİ" → ["uğur"]; parantez içi kısaltma ayrıca denenir: "(MBA)" → "mba"
const adSorgulari = (ad) => {
  const kisaltma = ad.match(/\(([^)]+)\)/)?.[1];
  return [kelimeler(ad.replace(/\(.*?\)/g, "")).join(" "), kisaltma && kucuk(kisaltma)].filter(Boolean);
};
// OSM'deki adın ayırt edici kelimelerinin hepsi okulun adında geçmeli ("Beyaz İnci" ≠ "Beyaz").
const adUyar = (ad) => (r) => {
  const bizim = new Set(kelimeler(ad));
  const onlar = kelimeler(r.name || "");
  return onlar.length > 0 && onlar.every((k) => bizim.has(k));
};

// "KÜÇÜKBAKKALKÖY MAH. KAZIM PAŞA SK. NO: 12 ..." → { sokak: "kazım paşa", tur: "sokak", no: "12" }
function adresParcala(adres) {
  const m = adres.match(/MAH\S*\s+(.+?)\s+(SK\.|SOKAK|CAD\.|CADDE|CADDESİ)\s*.*?NO\s*:\s*([\dA-Z\-\/]+)/);
  if (!m) return null;
  const tur = m[2].startsWith("SK") || m[2] === "SOKAK" ? "sokak" : "caddesi";
  return { sokak: kucuk(m[1]), tur, no: m[3].split(/[\/\-]/)[0] };
}

const OKUL_TURLERI = new Set(["school", "kindergarten", "college", "childcare", "educational_institution"]);
const okulMu = (r) => OKUL_TURLERI.has(r.type);
// "Kazım Paşa Sokağı" ile "kazım paşa" eşleşsin diye boşluksuz karşılaştırılır.
const bitisik = (s) => kucuk(s).replace(/\s+/g, "");
const yolUyar = (sokak) => (r) => r.category === "highway" && bitisik(r.name || "").startsWith(bitisik(sokak));
// Zincir okulların şubeleri farklı sokaklarda olabilir: OSM kaydının sokağı biliniyorsa adresle aynı olmalı.
const sokakUyar = (adr) => (r) => !adr || !r.address?.road || bitisik(r.address.road).startsWith(bitisik(adr.sokak));
// Köşe parseldeki okul OSM'de öbür sokağa kayıtlı olabilir: adresteki sokağa bu kadar yakınsa yine kabul edilir.
const YAKIN_M = 150;
const metre = ([enlem1, boylam1], [enlem2, boylam2]) => {
  const k = Math.PI / 180, x = (boylam2 - boylam1) * k * Math.cos(((enlem1 + enlem2) / 2) * k), y = (enlem2 - enlem1) * k;
  return Math.hypot(x, y) * 6371000;
};
const yolaUzaklik = (r, yol) => Math.min(...[yol.geojson.coordinates].flat(Infinity)
  .reduce((n, s, i, a) => (i % 2 ? n : [...n, [a[i + 1], s]]), [])
  .map((p) => metre([+r.lat, +r.lon], p)));

(async () => {
  const kayitDosyasi = path.join(KOK, "data/okul-konum.json");
  const kayit = fs.existsSync(kayitDosyasi) ? JSON.parse(fs.readFileSync(kayitDosyasi, "utf8")) : {};
  const okullar = oku("data/ozel-okul.json").filter((o) => o.mahalle === mahalleAdi && !kayit[o.ad]?.konum);
  const sayac = { ad: 0, adres: 0, sokak: 0, yok: 0 };

  for (const o of okullar) {
    const adr = adresParcala(o.adres);
    let r, kaynak, aday;
    try {
      for (const q of adSorgulari(o.ad)) {
        if (!(aday = await ara(q, (x) => okulMu(x) && adUyar(o.ad)(x)))) continue;
        if (sokakUyar(adr)(aday)) { r = aday; kaynak = "ad"; }
        break;
      }
      if (!r && adr && (r = await ara(`${adr.no} ${adr.sokak} ${adr.tur}`, (x) => okulMu(x) && sokakUyar(adr)(x)))) kaynak = "adres";
      if (!r && adr) {
        const yol = await ara(adr.sokak, yolUyar(adr.sokak), true);
        if (aday && yol && yolaUzaklik(aday, yol) <= YAKIN_M) { r = aday; kaynak = "ad"; }
        else if (yol) { r = yol; kaynak = "sokak"; }
      }
    } catch (e) { console.log(`! ${o.ad}: ${e.message}`); continue; }

    sayac[kaynak || "yok"]++;
    kayit[o.ad] = r
      ? { konum: [+(+r.lat).toFixed(6), +(+r.lon).toFixed(6)], kaynak, osm: `${r.osm_type}/${r.osm_id} ${r.name || r.display_name.split(",")[0]}` }
      : { konum: null, kaynak: null };
    console.log(`${r ? "✓" : "✗"} [${kaynak || "-"}] ${o.ad}${r ? " → " + kayit[o.ad].osm : ""}`);
  }

  fs.writeFileSync(kayitDosyasi, JSON.stringify(kayit, null, 2) + "\n");
  console.log(`\n${okullar.length} okul sorgulandı. Ad: ${sayac.ad}, adres: ${sayac.adres}, yalnızca sokak: ${sayac.sokak}, bulunamadı: ${sayac.yok}`);
})();
