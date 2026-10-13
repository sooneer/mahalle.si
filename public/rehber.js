"use strict";

// İl / ilçe / mahalle sayfaları. Veri public/data/*.json dosyalarından okunur (veritabanı yok).
// Laravel'e geçişte bu render fonksiyonları Blade şablonlarına, JSON okuma da controller'a taşınır.

// Yayında her yer kendi subdomain'inde: https://kucukbakkalkoy.mahalle.si/
// Yerelde klasör mantığı:               /istanbul/atasehir/kucukbakkalkoy
// Yönlendirme src/worker.js içinde (routePlace).
const ROOT_DOMAIN = "mahalle.si";
const IS_PROD = location.hostname === ROOT_DOMAIN || location.hostname.endsWith("." + ROOT_DOMAIN);
const placeUrl = (...yol) => IS_PROD ? `https://${yol.at(-1)}.${ROOT_DOMAIN}/` : "/" + yol.join("/");
const homeUrl = IS_PROD ? `https://${ROOT_DOMAIN}/` : "/";

// Sayfanın slug'ı: yayında subdomain'den, yerelde yolun ilgili parçasından
function currentSlug(depth, fallback) {
  const sub = location.hostname.endsWith("." + ROOT_DOMAIN) ? location.hostname.slice(0, -ROOT_DOMAIN.length - 1) : "";
  if (sub && sub !== "www") return sub;
  return location.pathname.split("/").filter(Boolean)[depth] || fallback;
}

// --- Yardımcılar -------------------------------------------------------------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function icon(id, cls) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#" + id);
  svg.append(use);
  return svg;
}

const soon = (label = "Çok yakında") =>
  h("span", { class: "soon", title: "Çok yakında" }, icon("i-hourglass"), h("span", {}, label));

const fold = (s) =>
  s.toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .trim();

const byName = (a, b) => a.ad.localeCompare(b.ad, "tr");

// Türkçe ekler: "Ataşehir'de", "Kadıköy'ün", "İstanbul'un"
const lastVowel = (w) => (w.toLocaleLowerCase("tr-TR").match(/[aeıioöuü]/g) || ["e"]).pop();
const endsWithVowel = (w) => /[aeıioöuü]$/.test(w.toLocaleLowerCase("tr-TR"));
function bulunma(ad) {
  const v = "aıou".includes(lastVowel(ad)) ? "a" : "e";
  const d = /[fstkçşhp]$/.test(ad.toLocaleLowerCase("tr-TR")) ? "t" : "d";
  return `${ad}'${d}${v}`;
}
function tamlayan(ad) {
  const v = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[lastVowel(ad)];
  return `${ad}'${endsWithVowel(ad) ? "n" : ""}${v}n`;
}

async function load(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}


function crumbs(items) {
  return h("nav", { class: "crumbs", "aria-label": "Konum" },
    h("ol", {}, items.map(([label, href], i) =>
      h("li", {}, i === items.length - 1
        ? h("span", { "aria-current": "page" }, label)
        : h("a", { href }, label)))));
}

function setBrandSub(slug) {
  const el = document.getElementById("brand-host");
  if (el) el.textContent = `${slug}.mahalle.si`;
}

// --- Toast + menü (app.js'in sayfadan bağımsız kısmı) ------------------------
const toastEl = document.getElementById("toast");
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.remove("is-hiding");
  toastTimer = setTimeout(() => {
    toastEl.classList.add("is-hiding");
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 300);
  }, 2800);
}

const nav = document.getElementById("site-nav");
const menuBtn = document.querySelector(".menu-toggle");
function setMenu(open) {
  nav.classList.toggle("is-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
}
menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
document.addEventListener("click", (e) => {
  if (nav.classList.contains("is-open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
  const soonLink = e.target.closest("[data-soon]");
  if (soonLink) {
    e.preventDefault();
    setMenu(false);
    toast(soonLink.dataset.soonMsg || `${soonLink.dataset.soon} çok yakında açılıyor.`);
  }
});

// Liste filtresi: data-name taşıyan <li>'leri gizler, boş sonuçta mesaj gösterir
function bindFilter(input, scope, emptyEl) {
  input.addEventListener("input", () => {
    const q = fold(input.value);
    let shown = 0;
    scope.querySelectorAll("li[data-name]").forEach((li) => {
      const hit = !q || li.dataset.name.includes(q);
      li.hidden = !hit;
      if (hit) shown++;
    });
    scope.querySelectorAll("[data-group]").forEach((g) => {
      g.hidden = !g.querySelector("li[data-name]:not([hidden])");
    });
    emptyEl.hidden = shown > 0;
  });
}

function pendingBlock(title, text) {
  return h("div", { class: "pending" },
    h("span", { class: "pending-icon" }, icon("i-hourglass")),
    h("h2", { class: "sr-only" }, title),
    h("p", { class: "page-lead" }, text),
    h("a", { class: "btn btn-orange", href: homeUrl + "#bulten-title" }, "Açılınca haber ver"));
}

// --- İl sayfası --------------------------------------------------------------
async function renderIl() {
  const slug = currentSlug(0, "istanbul");
  const { il, ilceler } = await load(`/data/iller/${slug}.json`);
  setBrandSub(il.slug);
  document.title = `${il.ad} Mahalle Rehberi · mahalle.si`;

  const acik = ilceler.filter((x) => x.aktif).length;
  const hero = document.getElementById("hero");
  hero.append(
    crumbs([["Türkiye", homeUrl], [il.ad]]),
    h("h1", { id: "hero-title" }, `${bulunma(il.ad)} mahalleni bul`),
    h("p", { class: "page-lead" }, `İlçeni seç, mahallenin eczanesine, okuluna ve esnafına ulaş. Mahalleleri tek tek açıyoruz; ${tamlayan(il.ad)} geri kalanı sırada.`),
    h("p", { class: "tally" },
      h("span", {}, h("b", {}, String(ilceler.length)), " ilçe"),
      h("span", { class: "is-open" }, h("b", {}, String(acik)), " ilçe açık"),
      h("span", {}, h("b", {}, String(ilceler.length - acik)), " ilçe hazırlanıyor")),
  );

  const list = document.getElementById("liste");
  const yakalar = [["anadolu", "Anadolu Yakası"], ["avrupa", "Avrupa Yakası"]];
  list.append(h("div", { class: "yaka-grid" }, yakalar.map(([key, title]) => {
    const items = ilceler.filter((x) => x.yaka === key).sort((a, b) => (b.aktif - a.aktif) || byName(a, b));
    return h("section", { class: "yaka", "data-group": key, "aria-labelledby": `y-${key}` },
      h("h2", { id: `y-${key}` }, title, h("small", {}, `${items.length} ilçe`)),
      h("ul", { class: "ilce-list" }, items.map((x) => x.aktif
        ? h("li", { class: "ilce-feature", "data-name": fold(x.ad) },
            h("a", { href: placeUrl(il.slug, x.slug) },
              icon("i-pin", "pin"),
              h("span", {}, h("strong", {}, x.ad), h("small", {}, `${x.mahalleSayisi} mahalle · rehber açık`)),
              icon("i-arrow", "go")))
        : h("li", { "data-name": fold(x.ad) },
            h("span", { class: "ilce-item is-off", "aria-disabled": "true" }, x.ad, soon())))));
  })));

  bindFilter(document.getElementById("q"), list, document.getElementById("bos"));
}

// --- İlçe sayfası ------------------------------------------------------------
async function renderIlce() {
  const slug = currentSlug(1, "atasehir");
  const hero = document.getElementById("hero");
  const list = document.getElementById("liste");
  setBrandSub(slug);

  let data;
  try { data = await load(`/data/ilceler/${slug}.json`); } catch { data = null; }

  if (!data || !data.ilce.aktif) {
    // Pasif ilçe: adı il listesinden bulunur
    const { il, ilceler } = await load("/data/iller/istanbul.json");
    const ilce = ilceler.find((x) => x.slug === slug);
    const ad = ilce ? ilce.ad : slug;
    document.title = `${ad} · mahalle.si`;
    hero.append(
      crumbs([["Türkiye", homeUrl], [il.ad, placeUrl(il.slug)], [ad]]),
      h("h1", { id: "hero-title" }, ilce ? `${ad} hazırlanıyor` : "Bu ilçeyi bulamadık"),
    );
    document.getElementById("filtre").hidden = true;
    list.append(pendingBlock("Durum", ilce
      ? `${tamlayan(ad)} mahalle rehberi üzerinde çalışıyoruz. Açıldığında ilk sen haberdar ol.`
      : `“${slug}” adında bir ilçe kaydımız yok. ${il.ad} ilçelerine dönüp oradan seçebilirsin.`));
    return;
  }

  const { ilce, il, mahalleler } = data;
  document.title = `${ilce.ad} Mahalleleri · mahalle.si`;
  const acik = mahalleler.filter((x) => x.aktif).length;
  hero.append(
    crumbs([["Türkiye", homeUrl], [il.ad, placeUrl(il.slug)], [ilce.ad]]),
    h("h1", { id: "hero-title" }, `${tamlayan(ilce.ad)} mahalleleri`),
    h("p", { class: "page-lead" }, `Mahalleni seç. Açık olan tabelalara tıklayabilirsin, kum saatliler sırada bekliyor.`),
    h("p", { class: "tally" },
      h("span", {}, h("b", {}, String(mahalleler.length)), " mahalle"),
      h("span", { class: "is-open" }, h("b", {}, String(acik)), " mahalle açık")),
  );

  const sorted = [...mahalleler].sort((a, b) => (b.aktif - a.aktif) || byName(a, b));
  list.append(h("ul", { class: "plaka-grid" },
    sorted.map((m) => h("li", { "data-name": fold(m.ad) }, m.aktif
      ? h("a", { class: "plaka", href: placeUrl(il.slug, ilce.slug, m.slug), lang: "tr" }, m.ad, h("span", { class: "tur" }, "Mah."))
      : h("span", { class: "plaka is-off", "aria-disabled": "true", lang: "tr" }, m.ad, h("span", { class: "tur" }, "Mah."), soon("")))),
    h("li", {},
      h("button", {
        type: "button", class: "plaka plaka-new", "data-soon": "Mahalle ekleme",
        "data-soon-msg": "Eksik mahalle eklemek için giriş yapman gerekecek. Üyelik çok yakında.",
      }, icon("i-plus"), "Eksik mahalle ekle", h("small", {}, "Giriş yapınca öner")))));

  bindFilter(document.getElementById("q"), list, document.getElementById("bos"));
}

// --- Kategori sayfaları ------------------------------------------------------
// Her kategori kendi sayfasında: https://kucukbakkalkoy.mahalle.si/eczaneler
// Yerelde: /istanbul/atasehir/kucukbakkalkoy/eczaneler. Harita kütüphanesi ve listeler yalnızca orada yüklenir,
// mahalle sayfası yalnızca kartları gösterir. Hangi kategorinin sayfası olduğu mahalle JSON'undaki `sayfa` alanından okunur.
const kategoriUrl = (il, ilce, mahalle, sayfa) =>
  IS_PROD ? `https://${mahalle}.${ROOT_DOMAIN}/${sayfa}` : `/${il}/${ilce}/${mahalle}/${sayfa}`;

// Kategori kartları: mahalle sayfasında hepsi, kategori sayfasında diğerleri
function kategoriKartlari({ mahalle, ilce, il, kategoriler }) {
  return kategoriler.map((k) => {
    const acik = k.sayfa && k.kayitSayisi;
    return h("li", {}, h("a", {
      class: "cat-card", style: `--c:${k.renk};--c-bg:${k.zemin}`,
      ...(acik
        ? { href: kategoriUrl(il.slug, ilce.slug, mahalle.slug, k.sayfa) }
        : { href: "#", "data-soon": k.ad, "data-soon-msg": `${mahalle.ad} için ${k.ad} rehberi hazırlanıyor.` }),
    },
      h("span", { class: "cat-icon" }, icon(k.ikon)),
      h("span", { class: "cat-name" }, k.ad),
      h("span", { class: "cat-desc" }, k.aciklama),
      acik
        ? h("span", { class: "cat-link" }, `${k.kayitSayisi} kayıt`, icon("i-arrow"))
        : h("span", { class: "cat-state" }, icon("i-hourglass"), "Hazırlanıyor")));
  });
}

// Kaynak veride adlar büyük harfle geliyor: "AKIN ECZANESİ" → "Akın Eczanesi"
const basHarf = (s) => s.toLocaleLowerCase("tr-TR")
  .replace(/(^|[\s(/-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase("tr-TR"));
// "+902165771101" → "0216 577 11 01"
const telefonYaz = (t) => t.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, "0$1 $2 $3 $4");

// --- Eczaneler ---------------------------------------------------------------
// Kategori sayfası çizicileri veri yoksa null, varsa sayfa başlığını ve özetini döner.
async function cizEczaneler(mahalle, ilce) {
  const data = await load(`/data/eczaneler/${mahalle.slug}.json`).catch(() => null);
  if (!data?.eczaneler.length) return null;

  const liste = data.eczaneler;
  document.getElementById("liste").append(...liste.map((e) => {
    const [enlem, boylam] = e.konum;
    return h("li", { class: "eczane" },
      h("span", { class: "eczane-icon" }, icon("i-pharmacy")),
      h("div", { class: "eczane-body" },
        h("h3", {}, basHarf(e.ad)),
        h("p", {}, e.adres)),
      h("div", { class: "eczane-actions" },
        e.telefon && h("a", { class: "btn btn-soft", href: `tel:${e.telefon}` }, telefonYaz(e.telefon)),
        h("a", {
          class: "btn btn-soft", target: "_blank", rel: "noopener",
          href: `https://www.google.com/maps/dir/?api=1&destination=${enlem},${boylam}`,
          "aria-label": `${basHarf(e.ad)} için yol tarifi`,
        }, "Yol tarifi")));
  }));
  haritayiHazirla(document.getElementById("harita"), mahalle, ilce, liste, {
    renk: "#e8505b",
    popup: (e) => [h("strong", {}, basHarf(e.ad)), h("span", {}, e.adres),
      e.telefon && h("a", { href: `tel:${e.telefon}` }, telefonYaz(e.telefon))],
  });
  document.getElementById("kaynak").textContent = "Bu listede nöbet bilgisi yok. Gece ya da tatil günü gitmeden önce eczaneyi telefonla ara.";
  return { baslik: `${tamlayan(mahalle.ad)} eczaneleri`, ozet: `${liste.length} eczane. Telefonla ara ya da yol tarifi al.` };
}

// --- Özel okullar ------------------------------------------------------------
// MEB türü → kademe: "Özel Türk Okul Öncesi Kurumu" → "Anaokulu"
// (regex'in /i bayrağı "İ"yi "i" saymaz, bu yüzden önce Türkçe küçük harfe çevrilir)
const KADEMELER = [
  ["Anaokulu", /okul öncesi|anaokulu/],
  ["İlkokul", /ilkokul/],
  ["Ortaokul", /ortaokul/],
  ["Lise", /lise|ortaöğretim/],
];
const kademe = (tur) => KADEMELER.find(([, re]) => re.test(tur.toLocaleLowerCase("tr-TR")))?.[0] ?? "Diğer";
// "(MBA)" gibi kısaltmalar basHarf'ten sonra yine büyük harf kalsın
const okulAdi = (ad) => basHarf(ad).replace(/\(([^)]{1,4})\)/g, (_, k) => `(${k.toLocaleUpperCase("tr-TR")})`);
// "KÜÇÜKBAKKALKÖY MAH. KAZIM PAŞA SK. NO: 12 ATAŞEHİR / İSTANBUL" → "Küçükbakkalköy Mah. Kazım Paşa Sk. No: 12"
const okulAdresi = (adres) => basHarf(adres.replace(/\s*ATAŞEHİR\s*\/\s*İSTANBUL/, ""))
  .replace(/(\d)(\p{Ll})\b/gu, (_, r, h) => r + h.toLocaleUpperCase("tr-TR")); // "21a" → "21A"
// Yalnızca sokağı bilinen okulda koordinat sokağın ortası; yol tarifi adresle aranır.
const yolTarifi = (o) => "https://www.google.com/maps/dir/?api=1&destination=" +
  (o.konumHassasiyeti === "bina" ? o.konum.join(",") : encodeURIComponent(`${okulAdi(o.ad)}, ${o.adres}`));

async function cizOkullar(mahalle, ilce) {
  const data = await load(`/data/okullar/${mahalle.slug}.json`).catch(() => null);
  if (!data?.okullar.length) return null;

  const liste = data.okullar.map((o) => ({ ...o, kademe: kademe(o.tur) }));
  const ogeler = liste.map((o) => h("li", { class: "eczane okul", "data-kademe": o.kademe },
    h("span", { class: "eczane-icon" }, icon("i-school")),
    h("div", { class: "eczane-body" },
      h("h3", {}, okulAdi(o.ad)),
      h("p", {}, okulAdresi(o.adres)),
      h("span", { class: "okul-tur" }, o.kademe)),
    h("div", { class: "eczane-actions" },
      o.telefon && h("a", { class: "btn btn-soft", href: `tel:${o.telefon}` }, telefonYaz(o.telefon)),
      h("a", {
        class: "btn btn-soft", target: "_blank", rel: "noopener", href: yolTarifi(o),
        "aria-label": `${okulAdi(o.ad)} için yol tarifi`,
      }, "Yol tarifi"))));
  document.getElementById("liste").append(...ogeler);

  const harita = haritayiHazirla(document.getElementById("harita"), mahalle, ilce, liste.filter((o) => o.konum), {
    renk: "#0f8a87",
    yaklasik: (o) => o.konumHassasiyeti !== "bina",
    popup: (o) => [h("strong", {}, okulAdi(o.ad)), h("span", {}, `${o.kademe} · ${okulAdresi(o.adres)}`),
      o.konumHassasiyeti !== "bina" && h("em", {}, "Konum yaklaşık: yalnızca sokak biliniyor."),
      o.telefon && h("a", { href: `tel:${o.telefon}` }, telefonYaz(o.telefon))],
  });

  // Kademe süzgeci: listeyi ve haritadaki noktaları birlikte süzer
  const sayilar = Object.fromEntries(KADEMELER.map(([k]) => [k, liste.filter((o) => o.kademe === k).length]));
  const secenekler = [["Tümü", liste.length], ...Object.entries(sayilar).filter(([, n]) => n)];
  const filtre = document.getElementById("filtre");
  filtre.setAttribute("aria-label", "Kademeye göre süz");
  const sec = (secilen) => {
    filtre.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kademe === secilen)));
    ogeler.forEach((li) => { li.hidden = secilen !== "Tümü" && li.dataset.kademe !== secilen; });
    harita.suz(secilen === "Tümü" ? null : (o) => o.kademe === secilen);
  };
  filtre.append(...secenekler.map(([k, n]) =>
    h("button", { type: "button", "data-kademe": k, "aria-pressed": String(k === "Tümü") }, k, h("small", {}, String(n)))));
  filtre.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) sec(b.dataset.kademe); });
  filtre.hidden = false;

  document.getElementById("kaynak").textContent = "Kaynak: MEB özel öğretim kurumları listesi. Haritada içi boş daireyle gösterilen okulların yalnızca sokağı biliniyor, konum yaklaşık. Konumlar © OpenStreetMap katkıcıları.";
  return { baslik: `${tamlayan(mahalle.ad)} özel okulları`, ozet: `${liste.length} özel okul, anaokulundan liseye. Telefonla ara ya da yol tarifi al.` };
}

// Sayfa slug'ı → çizici. Yeni kategori: buraya ekle, mahalle JSON'unda kategoriye `sayfa` ver, worker.js'te KATEGORI_SAYFALARI'na ekle.
const CIZICILER = { eczaneler: cizEczaneler, okullar: cizOkullar };

// --- Harita (MapLibre + OpenFreeMap) -----------------------------------------
// Kütüphane ~800 KB; yalnızca bölüm görünüme yaklaşınca yüklenir.
const MAPLIBRE = "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl";
const HARITA_STILI = "https://tiles.openfreemap.org/styles/positron";

function maplibreYukle() {
  if (window.maplibregl) return Promise.resolve();
  document.head.append(h("link", { rel: "stylesheet", href: `${MAPLIBRE}.css` }));
  return new Promise((resolve, reject) => {
    document.head.append(Object.assign(h("script", { src: `${MAPLIBRE}.js` }), { onload: resolve, onerror: reject }));
  });
}

// secenekler: renk (nokta rengi), popup(kayıt) → popup içeriği, yaklasik(kayıt) → içi boş nokta.
// Dönen nesnenin suz(fn) metodu noktaları süzer (null: hepsi); harita henüz çizilmediyse çizilince uygulanır.
function haritayiHazirla(kutu, mahalle, ilce, liste, secenekler) {
  const durum = { suzgec: null, uygula: null };
  const gozlemci = new IntersectionObserver((girdiler) => {
    if (!girdiler.some((g) => g.isIntersecting)) return;
    gozlemci.disconnect();
    haritaCiz(kutu, mahalle, ilce, liste, secenekler, durum).catch((err) => {
      console.error(err);
      kutu.hidden = true; // liste zaten var, harita olmadan da sayfa eksiksiz
    });
  }, { rootMargin: "300px" });
  gozlemci.observe(kutu);
  return { suz(fn) { durum.suzgec = fn; durum.uygula?.(); } };
}

async function haritaCiz(kutu, mahalle, ilce, liste, { renk, popup: popupIcerik, yaklasik = () => false }, durum) {
  const [, sinirlar] = await Promise.all([
    maplibreYukle(),
    load(`/data/sinirlar/${ilce.slug}.json`).catch(() => null),
  ]);
  const sinir = sinirlar?.mahalleler.find((m) => m.slug === mahalle.slug);
  const hareketsiz = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const noktalar = {
    type: "FeatureCollection",
    features: liste.map((e, i) => ({
      type: "Feature", id: i,
      geometry: { type: "Point", coordinates: [e.konum[1], e.konum[0]] },
      properties: { i, yaklasik: yaklasik(e) },
    })),
  };

  // Görünüm: mahalle sınırı varsa onu, yoksa noktaları kapsasın
  const tumKoordinatlar = sinir ? sinir.poligonlar.flatMap((p) => p[0]) : noktalar.features.map((f) => f.geometry.coordinates);
  const sinirKutusu = tumKoordinatlar.reduce(([a, b, c, d], [x, y]) =>
    [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);

  const harita = new maplibregl.Map({
    container: kutu,
    style: HARITA_STILI,
    bounds: [[sinirKutusu[0], sinirKutusu[1]], [sinirKutusu[2], sinirKutusu[3]]],
    fitBoundsOptions: { padding: 32 },
    cooperativeGestures: true, // mobilde sayfa kaydırması haritaya takılmasın
    fadeDuration: hareketsiz ? 0 : 300,
    attributionControl: { compact: true },
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Yakınlaştırmak için Ctrl tuşuna basılı tutarak kaydır",
      "CooperativeGesturesHandler.MacHelpText": "Yakınlaştırmak için ⌘ tuşuna basılı tutarak kaydır",
      "CooperativeGesturesHandler.MobileHelpText": "Haritayı kaydırmak için iki parmak kullan",
      "NavigationControl.ZoomIn": "Yakınlaştır",
      "NavigationControl.ZoomOut": "Uzaklaştır",
      "NavigationControl.ResetBearing": "Kuzeye döndür",
    },
  });
  harita.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  harita.on("load", () => {
    if (sinir) {
      harita.addSource("sinir", { type: "geojson", data: { type: "MultiPolygon", coordinates: sinir.poligonlar } });
      harita.addLayer({ id: "sinir-dolgu", type: "fill", source: "sinir", paint: { "fill-color": "#14a3a0", "fill-opacity": 0.08 } });
      harita.addLayer({ id: "sinir-cizgi", type: "line", source: "sinir", paint: { "line-color": "#0b7a77", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
    }
    harita.addSource("noktalar", { type: "geojson", data: noktalar });
    harita.addLayer({
      id: "nokta", type: "circle", source: "noktalar",
      // Yaklaşık konum içi boş daire: sokak biliniyor, bina bilinmiyor
      paint: {
        "circle-radius": 8,
        "circle-color": ["case", ["get", "yaklasik"], "#fff", renk],
        "circle-stroke-color": ["case", ["get", "yaklasik"], renk, "#fff"],
        "circle-stroke-width": 2.5,
      },
    });
    durum.uygula = () => {
      const gorunen = liste.flatMap((e, i) => (!durum.suzgec || durum.suzgec(e) ? [i] : []));
      harita.setFilter("nokta", durum.suzgec ? ["in", ["get", "i"], ["literal", gorunen]] : null);
      popup.remove();
    };
    if (durum.suzgec) durum.uygula();
  });

  const popup = new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: "260px" });
  harita.on("click", "nokta", (ev) => {
    const e = liste[ev.features[0].properties.i];
    popup.setLngLat(ev.features[0].geometry.coordinates)
      .setDOMContent(h("div", { class: "harita-popup" }, popupIcerik(e)))
      .addTo(harita);
  });
  harita.on("mouseenter", "nokta", () => { harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "nokta", () => { harita.getCanvas().style.cursor = ""; });
}

// --- Mahalle sayfası ---------------------------------------------------------
async function renderMahalle() {
  const slug = currentSlug(2, "kucukbakkalkoy");
  setBrandSub(slug);
  const hero = document.getElementById("hero");

  let data;
  try { data = await load(`/data/mahalleler/${slug}.json`); } catch { data = null; }
  if (!data) {
    document.title = "Mahalle hazırlanıyor · mahalle.si";
    hero.append(h("h1", { id: "hero-title" }, "Bu mahalle hazırlanıyor"));
    document.getElementById("rehber").replaceChildren(h("div", { class: "container" },
      pendingBlock("Durum", "Bu mahallenin rehberi henüz açılmadı. Açıldığında ilk sen haberdar ol.")));
    document.querySelectorAll("[data-only-active]").forEach((el) => { el.hidden = true; });
    return;
  }

  const { mahalle, ilce, il, kategoriler } = data;
  // Eski bağlantılar (#eczaneler, #okullar) kategori sayfasına gider
  const eskiBolum = kategoriler.find((k) => k.sayfa && `#${k.sayfa}` === location.hash);
  if (eskiBolum) { location.replace(kategoriUrl(il.slug, ilce.slug, mahalle.slug, eskiBolum.sayfa)); return; }

  document.title = `${mahalle.ad} Mahalle Rehberi · ${ilce.ad} · mahalle.si`;
  // Ana sayfadaki "Son baktığın" kısayolu için
  try {
    localStorage.setItem("sonMahalle", JSON.stringify({ ad: mahalle.ad, yol: [il.slug, ilce.slug, mahalle.slug] }));
  } catch {}
  hero.append(
    crumbs([["Türkiye", homeUrl], [il.ad, placeUrl(il.slug)], [ilce.ad, placeUrl(il.slug, ilce.slug)], [mahalle.ad]]),
    h("p", { class: "plaka", lang: "tr", "aria-hidden": "true" }, mahalle.ad, h("span", { class: "tur" }, "Mah.")),
    h("h1", { id: "hero-title" }, `${bulunma(mahalle.ad)} `, h("span", { class: "hl" }, "ne arıyorsun?")),
  );
  document.getElementById("rehber-title").textContent = `${mahalle.ad} rehberi`;
  document.getElementById("kategoriler").append(...kategoriKartlari(data));

  // Aynı ilçedeki diğer mahalleler
  const ilceData = await load(`/data/ilceler/${ilce.slug}.json`).catch(() => null);
  if (ilceData) {
    document.getElementById("komsu-title").textContent = `${tamlayan(ilce.ad)} diğer mahalleleri`;
    const digerleri = ilceData.mahalleler.filter((m) => m.slug !== mahalle.slug).sort(byName);
    document.getElementById("komsu").append(...digerleri.map((m) => m.aktif
      ? h("a", { class: "plaka", href: placeUrl(il.slug, ilce.slug, m.slug), lang: "tr" }, m.ad)
      : h("span", { class: "plaka is-off", "aria-disabled": "true", lang: "tr" }, m.ad, soon(""))));
    document.getElementById("komsu-link").href = placeUrl(il.slug, ilce.slug);
  }
}

// --- Kategori sayfası (eczaneler, okullar) -----------------------------------
async function renderKategori() {
  const slug = currentSlug(2, "kucukbakkalkoy");
  const sayfa = location.pathname.split("/").filter(Boolean).at(-1);
  setBrandSub(slug);
  const hero = document.getElementById("hero");

  const data = await load(`/data/mahalleler/${slug}.json`).catch(() => null);
  const kategori = data?.kategoriler.find((k) => k.sayfa === sayfa);
  const sonuc = kategori && CIZICILER[sayfa] ? await CIZICILER[sayfa](data.mahalle, data.ilce) : null;

  if (!sonuc) {
    document.title = "Sayfa hazırlanıyor · mahalle.si";
    hero.append(h("h1", { id: "hero-title" }, "Bu sayfa hazırlanıyor"));
    document.querySelector(".kategori-section .container").replaceChildren(
      pendingBlock("Durum", "Bu rehber henüz açılmadı. Açıldığında ilk sen haberdar ol."));
    document.querySelectorAll("[data-only-active]").forEach((el) => { el.hidden = !data; });
    if (data) kategoriBaglantilari(data, null);
    return;
  }

  const { mahalle, ilce, il } = data;
  document.title = `${sonuc.baslik} · ${ilce.ad} · mahalle.si`;
  hero.append(
    crumbs([["Türkiye", homeUrl], [il.ad, placeUrl(il.slug)], [ilce.ad, placeUrl(il.slug, ilce.slug)],
      [mahalle.ad, placeUrl(il.slug, ilce.slug, mahalle.slug)], [kategori.ad]]),
    h("h1", { id: "hero-title" }, sonuc.baslik),
    h("p", { class: "page-lead" }, sonuc.ozet),
  );
  document.getElementById("harita").setAttribute("aria-label", `${sonuc.baslik} haritası. Aynı bilgiler aşağıdaki listede de var.`);
  kategoriBaglantilari(data, kategori);
}

// Kategori sayfasının altında mahallenin diğer kategorileri
function kategoriBaglantilari(data, mevcut) {
  const { mahalle, ilce, il } = data;
  document.getElementById("diger-title").textContent = `${mahalle.ad} rehberi`;
  document.getElementById("mahalle-link").href = placeUrl(il.slug, ilce.slug, mahalle.slug);
  document.getElementById("kategoriler").append(...kategoriKartlari({
    ...data, kategoriler: data.kategoriler.filter((k) => k !== mevcut),
  }));
}

const PAGES = { il: renderIl, ilce: renderIlce, mahalle: renderMahalle, kategori: renderKategori };
PAGES[document.body.dataset.page]().catch((err) => {
  console.error(err);
  toast("Veri yüklenemedi. Sayfayı bir sunucu üzerinden açtığından emin ol (npx wrangler dev).");
});

// Sabit menü linkleri ortama göre (yol ya da subdomain)
document.querySelectorAll("a[data-yol]").forEach((a) => { a.href = placeUrl(...a.dataset.yol.split("/")); });
