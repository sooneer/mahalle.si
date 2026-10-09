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

    return env.ASSETS.fetch(request);
  },
};
