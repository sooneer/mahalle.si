// Devlet okullarının konum, telefon ve adresini okulların MEB sitelerinden toplar.
// Girdi:  data/devlet-okul.json ({ data: [{ OKUL_ADI, HOST, YOL }] })
// Çıktı:  data/devlet-okul-meb.json (HOST → { ad, adres, telefon, konum }). Toplanan okullar yeniden istenmez.
// Kullanım: node scripts/devlet-okul-topla.js   (sonra node scripts/okul-donustur.js)
//
// Konum: https://<HOST>.meb.k12.tr/tema/harita.php içindeki Google Maps iframe'inin q=enlem,boylam değeri.
// Telefon ve adres: https://<HOST>.meb.k12.tr/meb_iys_dosyalar/<YOL>/okulumuz_hakkinda.html "İletişim" sekmesi.

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "data/devlet-okul-meb.json");
const okullar = JSON.parse(fs.readFileSync(path.join(KOK, "data/devlet-okul.json"), "utf8")).data;
const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "mahalle.si/0.1 (https://mahalle.si)";

async function getir(url) {
  for (let deneme = 1; ; deneme++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      await bekle(1000); // MEB sunucularını yormamak için istekler arasında 1 sn
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (deneme === 2) throw e;
      await bekle(3000);
    }
  }
}

const temizle = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
// Okul sitelerinde iki şablon var:
//   sekmeli: <div id="iletisim">… <i class="fa fa-phone"></i> Telefon - 0 216 504 54 01<br>
//   kutulu:  <div …>Telefon</div> <div …>0216 313 23 88</div>
//   tablolu: <td>Telefon :</td> <td>216 455 3660 / 216 456 2958</td>
function alanOku(html, etiket) {
  const sekme = html.match(new RegExp(`id="iletisim"[\\s\\S]*?</i>\\s*${etiket}\\s*-\\s*([^<]*)`))?.[1];
  const kutu = html.match(new RegExp(`>${etiket}</div>\\s*<div[^>]*>([^<]*)</div>`))?.[1];
  const tablo = html.match(new RegExp(`>${etiket}\\s*:?\\s*</td>\\s*<td[^>]*>([^<]*)`))?.[1];
  return [sekme, kutu, tablo].map((s) => s && temizle(s)).find(Boolean) ?? null;
}
// "0 216 504 54 01", "(0216) 313-23-88 / 0216 …" → ilk numara "+902165045401"
function telefonOku(html) {
  const m = (alanOku(html, "Telefon") ?? "").match(/(?:\+?90)?\s*0?\s*\(?\s*([2-5]\d{2})\s*\)?[\s.\-]*(\d{3})[\s.\-]*(\d{2})[\s.\-]*(\d{2})/);
  return m ? `+90${m[1]}${m[2]}${m[3]}${m[4]}` : null;
}
const adresOku = (html) => alanOku(html, "Adres");
// Ayrıştırıcı değişince artırılır: eski sürümle toplanan okulların iletişim bilgisi yeniden okunur.
const SURUM = 3;
function konumOku(html) {
  const m = html.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  const [enlem, boylam] = [+m[1], +m[2]];
  // Türkiye dışı ya da 0,0 gibi boş değerler atılır
  return enlem > 35 && enlem < 43 && boylam > 25 && boylam < 45 ? [+enlem.toFixed(6), +boylam.toFixed(6)] : null;
}

(async () => {
  const sayac = { yeni: 0, hata: 0 };
  for (const o of okullar) {
    const eski = kayit[o.HOST];
    // Bilgisi tam olan okul yeniden istenmez; eksik olan, ayrıştırıcı değiştiyse yeniden denenir
    if (eski?.surum === SURUM || (eski?.adres && eski?.telefon && eski?.konum)) continue;
    const ad = o.OKUL_ADI.split(" - ").at(-1).trim();
    const site = `https://${o.HOST}.meb.k12.tr`;
    try {
      const hakkinda = await getir(`${site}/meb_iys_dosyalar/${o.YOL}/okulumuz_hakkinda.html`);
      // Konum zaten bulunduysa harita sayfası yeniden istenmez
      const konum = eski?.konum ?? konumOku(await getir(`${site}/tema/harita.php`).catch(() => ""));
      kayit[o.HOST] = { ad, adres: adresOku(hakkinda), telefon: telefonOku(hakkinda), konum, site, surum: SURUM };
      sayac.yeni++;
      const k = kayit[o.HOST];
      console.log(`${k.konum ? "✓" : "✗"} ${ad} | ${k.telefon ?? "telefon yok"} | ${k.adres ?? "adres yok"}`);
    } catch (e) {
      sayac.hata++;
      console.log(`! ${ad} (${site}): ${e.message}`);
    }
    fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 2) + "\n"); // yarıda kesilirse kaldığı yerden devam eder
  }
  const tum = Object.values(kayit);
  console.log(`\n${sayac.yeni} okul toplandı, ${sayac.hata} hata. Toplam ${tum.length}/${okullar.length}: ` +
    `konumsuz ${tum.filter((k) => !k.konum).length}, adressiz ${tum.filter((k) => !k.adres).length}, telefonsuz ${tum.filter((k) => !k.telefon).length}.`);
})();
