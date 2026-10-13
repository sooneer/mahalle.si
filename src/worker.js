const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_EXPECTED_ACTION = "subscribe";
const TURNSTILE_EXPECTED_HOSTNAME = "mahalle.si";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function verifyTurnstile(token, remoteip, env) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return false;
  }
  let result;
  try {
    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip,
      }),
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch {
    // Network error, non-2xx, or non-JSON body from siteverify. Fail closed.
    return false;
  }
  return (
    result.success === true &&
    result.action === TURNSTILE_EXPECTED_ACTION &&
    result.hostname === TURNSTILE_EXPECTED_HOSTNAME
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const turnstileToken = body["cf-turnstile-response"];
      const remoteip = request.headers.get("CF-Connecting-IP") || "";
      if (!(await verifyTurnstile(turnstileToken, remoteip, env))) {
        return json({ error: "turnstile_failed" }, 403);
      }

      let email = String(body.email ?? "").trim().toLowerCase();
      if (email.length > 254 || !EMAIL_RE.test(email)) {
        return json({ error: "invalid_email" }, 400);
      }

      await env.DB.prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)")
        .bind(email)
        .run();
      return json({ ok: true });
    }

    const page = await routePlace(url, request, env);
    if (page) return page;

    return env.ASSETS.fetch(request);
  },
};

// --- İl / ilçe / mahalle yönlendirmesi ----------------------------------------
// Yayında:  istanbul.mahalle.si, atasehir.mahalle.si, kucukbakkalkoy.mahalle.si
// Yerelde:  localhost:8787/istanbul/atasehir/kucukbakkalkoy (klasör mantığı)
// Yayındaki ana alan adında klasör yolu gelirse ilgili subdomain'e 301 ile yönlendirilir.
const ROOT_DOMAIN = "mahalle.si";
const PAGE_BY_DEPTH = ["/il", "/ilce", "/mahalle"]; // il.html, ilce.html, mahalle.html
const PAGE_BY_TYPE = { il: "/il", ilce: "/ilce", mahalle: "/mahalle" };
// Mahallenin kategori sayfaları (kategori.html): kucukbakkalkoy.mahalle.si/eczaneler
// Yeni kategori: buraya, public/rehber.js CIZICILER'e ve mahalle JSON'unda kategoriye `sayfa` olarak ekle.
const KATEGORI_SAYFALARI = new Set(["eczaneler", "okullar"]);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function loadSlugs(url, env) {
  const res = await env.ASSETS.fetch(new URL("/data/slugs.json", url));
  return res.ok ? res.json() : {};
}

function servePage(path, url, request, env) {
  return env.ASSETS.fetch(new Request(new URL(path, url), request));
}

async function routePlace(url, request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // wrangler dev, routes ayarı yüzünden hostname'i her istekte mahalle.si yapar, bu yüzden
  // ortam adresten değil YONLENDIRME değişkeninden okunur (wrangler.jsonc: subdomain, .dev.vars: klasor).
  const isProd = env.YONLENDIRME !== "klasor";
  const host = isProd ? url.hostname : "localhost";
  const sub = host.endsWith("." + ROOT_DOMAIN) ? host.slice(0, -ROOT_DOMAIN.length - 1) : "";

  // Subdomain: sayfa türü slug haritasından bulunur
  const notFound = () => new Response("Bu adreste bir yer bulunamadı.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  if (sub && sub !== "www") {
    const kategori = url.pathname.replace(/^\/|\/$/g, "");
    // /data, /img, /styles.css vb. doğrudan Assets'ten
    if (url.pathname !== "/" && !KATEGORI_SAYFALARI.has(kategori)) return null;
    const place = (await loadSlugs(url, env))[sub];
    if (!place) return notFound();
    if (kategori) return place.tur === "mahalle" ? servePage("/kategori", url, request, env) : notFound();
    return servePage(PAGE_BY_TYPE[place.tur], url, request, env);
  }

  // Klasör yolu: /istanbul, /istanbul/atasehir, /istanbul/atasehir/kucukbakkalkoy[/eczaneler]
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 1 || segs.length > 4 || !segs.every((s) => SLUG_RE.test(s))) return null;
  if (["data", "img", "api"].includes(segs[0])) return null;
  const kategori = segs.length === 4 ? segs.pop() : null;
  if (kategori && !KATEGORI_SAYFALARI.has(kategori)) return null;

  if (isProd) {
    const place = (await loadSlugs(url, env))[segs.at(-1)];
    if (place && place.yol.join("/") === segs.join("/")) {
      return Response.redirect(`https://${segs.at(-1)}.${ROOT_DOMAIN}/${kategori ?? ""}`, 301);
    }
    return null;
  }
  return servePage(kategori ? "/kategori" : PAGE_BY_DEPTH[segs.length - 1], url, request, env);
}
