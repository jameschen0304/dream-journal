import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  mode?: "chat" | "models";
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  openrouter_api_key?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const key = body.openrouter_api_key?.trim();
  if (!key) {
    return new Response(JSON.stringify({ error: "missing openrouter_api_key" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const referer = Deno.env.get("OPENROUTER_SITE_URL") ?? "https://jameschen0304.github.io/dream-journal/";
  const orHeaders: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "Dream Journal",
  };

  try {
    if (body.mode === "models") {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${key}`, ...openRouterBrowserHeaders(referer) },
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!body.model || !body.messages?.length) {
      return new Response(JSON.stringify({ error: "missing model or messages" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: orHeaders,
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: body.temperature ?? 0.8,
      }),
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function openRouterBrowserHeaders(referer: string): Record<string, string> {
  return {
    "HTTP-Referer": referer,
    "X-Title": "Dream Journal",
  };
}
