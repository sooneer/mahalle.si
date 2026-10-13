"use strict";

const TURNSTILE_SITEKEY = "0x4AAAAAAFSWfYcyHk899CeC";

// --- Toast -----------------------------------------------------------------
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

// --- Mobil menü ------------------------------------------------------------
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
});

// --- Kategori vurgulama ----------------------------------------------------
function focusCategory(id) {
  const card = document.getElementById("cat-" + id);
  if (!card) return null;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.remove("is-hit");
  void card.offsetWidth; // animasyonu yeniden başlat
  card.classList.add("is-hit");
  setTimeout(() => card.classList.remove("is-hit"), 2400);
  return card;
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-soon], a[data-focus]");
  if (!link) return;
  e.preventDefault();
  setMenu(false);
  if (link.dataset.focus) focusCategory(link.dataset.focus);
  else toast(`${link.dataset.soon} çok yakında açılıyor.`);
});

// --- Arama -----------------------------------------------------------------
const fold = (s) =>
  s.toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .trim();

const KEYWORDS = {
  eczane: ["eczane", "nobetci", "ilac", "eczaci"],
  okul: ["okul", "kolej", "anaokul", "kres", "lise", "ilkokul", "ortaokul", "egitim", "kurs", "dershane"],
  kuyumcu: ["kuyumcu", "altin", "pirlanta", "mucevher", "saat", "yuzuk", "bilezik"],
  usta: ["usta", "tesisat", "elektrik", "cilingir", "tamir", "boya", "kombi", "kilit", "anahtar", "marangoz", "camci"],
  kafe: ["kafe", "cafe", "restoran", "yemek", "kahvalti", "kahve", "pastane", "firin", "lokanta", "tatli"],
  yardim: ["kayip", "kedi", "kopek", "pati", "yardim", "bagis", "sahiplen", "gonullu"],
  temizleme: ["temizleme", "kuru", "utu", "hali", "perde", "camasir", "yikama"],
};

function matchCategory(query) {
  const q = fold(query);
  if (!q) return null;
  for (const [id, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => q.includes(w) || (q.length >= 3 && w.startsWith(q)))) return id;
  }
  return null;
}

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("q");
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) { searchInput.focus(); return; }
  const id = matchCategory(query);
  if (id) {
    const card = focusCategory(id);
    const name = card.querySelector(".cat-name").textContent;
    toast(`“${query}” için ${name} rehberi çok yakında burada.`);
  } else {
    toast(`“${query}” için henüz içerik yok, yakında ekleyeceğiz.`);
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    searchInput.value = chip.textContent;
    searchForm.requestSubmit();
  });
});

// --- Konumla mahalle bulma ---------------------------------------------------
// Konum tarayıcıda kalır: sınır dosyaları indirilir, eşleştirme burada yapılır.
// Yollar klasör biçiminde; yayında Worker bunları ilgili subdomain'e yönlendirir.
const konumBtn = document.getElementById("konum-btn");
const konumSonuc = document.getElementById("konum-sonuc");
const yolUrl = (yol) => "/" + yol.join("/");

// Işın atma: nokta halkanın içinde mi? (koordinatlar [boylam, enlem])
function halkada([x, y], halka) {
  let ic = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i], [xj, yj] = halka[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}
const poligonda = (nokta, [dis, ...delikler]) => halkada(nokta, dis) && !delikler.some((d) => halkada(nokta, d));

async function mahalleBul(nokta) {
  const [x, y] = nokta;
  const index = await fetch("/data/sinirlar/index.json").then((r) => r.json());
  for (const { ilce, kutu } of index.filter(({ kutu: [x1, y1, x2, y2] }) => x >= x1 && x <= x2 && y >= y1 && y <= y2)) {
    const veri = await fetch(`/data/sinirlar/${ilce}.json`).then((r) => r.json());
    const m = veri.mahalleler.find((m) => m.poligonlar.some((p) => poligonda(nokta, p)));
    if (m) return { ...m, il: veri.il, ilce: veri.ilce };
  }
  return null;
}

function konumuAl() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("destek"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]), reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  });
}

function sonucGoster(...cocuklar) {
  konumSonuc.replaceChildren(...cocuklar);
  konumSonuc.hidden = false;
}
function el(tag, attrs, text) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text) e.textContent = text;
  return e;
}

function mahalleSonucu(m, oneri) {
  const ilceUrl = yolUrl([m.il.slug, m.ilce.slug]);
  const soru = oneri ? `${m.ad} civarındasın gibi görünüyor.` : `${m.ad} Mahallesi'nde misin? (${m.ilce.ad})`;
  if (!m.aktif) {
    return sonucGoster(el("p", {}, `${soru} Bu mahallenin rehberi henüz hazırlanıyor.`),
      el("a", { className: "btn btn-navy", href: ilceUrl }, `${m.ilce.ad} mahallelerine bak`));
  }
  sonucGoster(el("p", {}, soru),
    el("a", { className: "btn btn-orange", href: yolUrl([m.il.slug, m.ilce.slug, m.slug]) }, oneri ? `${m.ad} rehberine git` : "Evet, rehbere git"),
    el("a", { className: "btn btn-ghost", href: ilceUrl }, "Başka mahalle seç"));
}

async function konumlaBul(oneri = false) {
  konumBtn.disabled = true;
  konumBtn.lastElementChild.textContent = "Konum alınıyor...";
  try {
    const m = await mahalleBul(await konumuAl());
    if (m) mahalleSonucu(m, oneri);
    else if (!oneri) sonucGoster(el("p", {}, "Bulunduğun bölge henüz açık değil. Şimdilik Ataşehir'deki mahalleleri tanıyoruz."),
      el("a", { className: "btn btn-navy", href: "/istanbul" }, "İlçelere göz at"));
  } catch (err) {
    if (oneri) return;
    sonucGoster(el("p", {}, err.code === 1
      ? "Konum izni verilmedi. Mahalleni aşağıdan seçebilirsin."
      : "Konumun alınamadı. Mahalleni aşağıdan seçebilirsin."));
  } finally {
    konumBtn.disabled = false;
    konumBtn.lastElementChild.textContent = "Konumumla bul";
  }
}

konumBtn.addEventListener("click", () => konumlaBul(false));

// İzin daha önce verildiyse sormadan öneri göster; yönlendirme yapma, karar kullanıcının.
navigator.permissions?.query({ name: "geolocation" })
  .then((izin) => { if (izin.state === "granted") konumlaBul(true); })
  .catch(() => {});

// Son bakılan mahalle (mahalle sayfası kaydediyor)
try {
  const son = JSON.parse(localStorage.getItem("sonMahalle") || "null");
  if (son?.ad && Array.isArray(son.yol) && son.yol.every((s) => /^[a-z0-9-]+$/.test(s))) {
    const link = document.getElementById("son-mahalle");
    link.href = yolUrl(son.yol);
    link.textContent = `Son baktığın: ${son.ad}`;
    link.hidden = false;
  }
} catch {}

// --- Bülten + Turnstile -----------------------------------------------------
const nlForm = document.getElementById("newsletter-form");
const nlEmail = document.getElementById("email");
const nlBtn = nlForm.querySelector("button[type=submit]");
const nlMsg = document.getElementById("form-msg");
let widgetId = null;
let turnstileToken = "";
let sending = false;

function syncButton() { nlBtn.disabled = sending || !turnstileToken; }
function setMsg(text, kind = "") { nlMsg.textContent = text; nlMsg.className = "form-msg " + kind; }

function renderTurnstile() {
  if (widgetId !== null || !window.turnstile) return;
  widgetId = window.turnstile.render("#cf-turnstile", {
    sitekey: TURNSTILE_SITEKEY,
    action: "subscribe",
    theme: "dark",
    callback: (token) => { turnstileToken = token; syncButton(); },
    "error-callback": () => { turnstileToken = ""; syncButton(); },
    "expired-callback": () => { turnstileToken = ""; syncButton(); },
  });
}
window.onTurnstileLoad = renderTurnstile;
renderTurnstile(); // betik bizden önce yüklendiyse

nlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (sending || !turnstileToken) return;
  if (!nlEmail.checkValidity() || !nlEmail.value.trim()) {
    setMsg("Geçerli bir e-posta adresi yaz.", "err");
    nlEmail.focus();
    return;
  }
  sending = true;
  syncButton();
  setMsg("Gönderiliyor…");
  const token = turnstileToken;
  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: nlEmail.value, "cf-turnstile-response": token }),
    });
    if (!res.ok) throw new Error(String(res.status));
    setMsg("Teşekkürler! Mahalleden haberleri e-postana göndereceğiz.", "ok");
    nlForm.reset();
  } catch {
    setMsg("Bir sorun oluştu, lütfen tekrar dene.", "err");
  } finally {
    sending = false;
    turnstileToken = "";
    syncButton();
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  }
});
