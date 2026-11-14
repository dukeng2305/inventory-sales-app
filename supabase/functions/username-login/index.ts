const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers });

  const body = await request.json().catch(() => null);
  if (typeof body?.password !== "string" || !body.password || body.password.length > 1024) {
    return new Response(null, { status: 401, headers });
  }

  const emailKey = body.username === "duongngo" ? "INVENTORY_ADMIN_EMAIL"
    : body.username === "trantrang" ? "INVENTORY_TRANTRANG_EMAIL" : null;
  const email = emailKey && Deno.env.get(emailKey);
  if (!email) return new Response(null, { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return new Response(null, { status: 503, headers });

  try {
    const response = await fetch(url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: body.password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 401;
      return new Response(null, { status, headers });
    }
    const { access_token, refresh_token, expires_in } = await response.json();
    return Response.json({ access_token, refresh_token, expires_in }, { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
});
