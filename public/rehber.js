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

// --- Eczaneler ---------------------------------------------------------------
// Kaynak veride adlar büyük harfle geliyor: "AKIN ECZANESİ" → "Akın Eczanesi"
const basHarf = (s) => s.toLocaleLowerCase("tr-TR")
  .replace(/(^|[\s(/-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase("tr-TR"));
// "+902165771101" → "0216 577 11 01"
const telefonYaz = (t) => t.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, "0$1 $2 $3 $4");

async function renderEczaneler(mahalle, ilce) {
  const data = await load(`/data/eczaneler/${mahalle.slug}.json`).catch(() => null);
  if (!data?.eczaneler.length) return 0;

  const liste = data.eczaneler;
  document.getElementById("eczane-title").textContent = `${tamlayan(mahalle.ad)} eczaneleri`;
  document.getElementById("eczane-lead").textContent = `${liste.length} eczane. Telefonla ara ya da yol tarifi al.`;
  document.getElementById("eczane-list").append(...liste.map((e) => {
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
  const bolum = document.getElementById("eczaneler");
  bolum.hidden = false;
  haritayiHazirla(mahalle, ilce, liste);
  // Bölüm veri gelince açıldığı için tarayıcı #eczaneler'e kendiliğinden kaymaz
  if (location.hash === "#eczaneler") requestAnimationFrame(() => bolum.scrollIntoView());
  return liste.length;
}

// --- Eczane haritası (MapLibre + OpenFreeMap) --------------------------------
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

function haritayiHazirla(mahalle, ilce, liste) {
  const kutu = document.getElementById("eczane-harita");
  const gozlemci = new IntersectionObserver((girdiler) => {
    if (!girdiler.some((g) => g.isIntersecting)) return;
    gozlemci.disconnect();
    haritaCiz(kutu, mahalle, ilce, liste).catch((err) => {
      console.error(err);
      kutu.hidden = true; // liste zaten var, harita olmadan da sayfa eksiksiz
    });
  }, { rootMargin: "300px" });
  gozlemci.observe(kutu);
}

async function haritaCiz(kutu, mahalle, ilce, liste) {
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
      properties: { i },
    })),
  };

  // Görünüm: mahalle sınırı varsa onu, yoksa eczaneleri kapsasın
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
    harita.addSource("eczaneler", { type: "geojson", data: noktalar });
    harita.addLayer({
      id: "eczane-nokta", type: "circle", source: "eczaneler",
      paint: { "circle-radius": 8, "circle-color": "#e8505b", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 },
    });
  });

  const popup = new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: "260px" });
  harita.on("click", "eczane-nokta", (ev) => {
    const e = liste[ev.features[0].properties.i];
    popup.setLngLat(ev.features[0].geometry.coordinates)
      .setDOMContent(h("div", { class: "harita-popup" },
        h("strong", {}, basHarf(e.ad)),
        h("span", {}, e.adres),
        e.telefon && h("a", { href: `tel:${e.telefon}` }, telefonYaz(e.telefon))))
      .addTo(harita);
  });
  harita.on("mouseenter", "eczane-nokta", () => { harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "eczane-nokta", () => { harita.getCanvas().style.cursor = ""; });
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

  const eczaneSayisi = await renderEczaneler(mahalle, ilce);
  document.getElementById("kategoriler").append(...kategoriler.map((k) =>
    h("li", {}, h("a", {
      class: "cat-card", style: `--c:${k.renk};--c-bg:${k.zemin}`,
      ...(k.id === "eczane" && eczaneSayisi
        ? { href: "#eczaneler" }
        : { href: "#", "data-soon": k.ad, "data-soon-msg": `${mahalle.ad} için ${k.ad} rehberi hazırlanıyor.` }),
    },
      h("span", { class: "cat-icon" }, icon(k.ikon)),
      h("span", { class: "cat-name" }, k.ad),
      h("span", { class: "cat-desc" }, k.aciklama),
      k.kayitSayisi == null
        ? h("span", { class: "cat-state" }, icon("i-hourglass"), "Hazırlanıyor")
        : h("span", { class: "cat-link" }, `${k.kayitSayisi} kayıt`, icon("i-arrow"))))));

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

const PAGES = { il: renderIl, ilce: renderIlce, mahalle: renderMahalle };
PAGES[document.body.dataset.page]().catch((err) => {
  console.error(err);
  toast("Veri yüklenemedi. Sayfayı bir sunucu üzerinden açtığından emin ol (npx wrangler dev).");
});

// Sabit menü linkleri ortama göre (yol ya da subdomain)
document.querySelectorAll("a[data-yol]").forEach((a) => { a.href = placeUrl(...a.dataset.yol.split("/")); });
