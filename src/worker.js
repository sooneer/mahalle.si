const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

      let email;
      try {
        ({ email } = await request.json());
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      email = String(email ?? "").trim().toLowerCase();
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
