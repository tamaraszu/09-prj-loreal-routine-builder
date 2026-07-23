/**
 * Cloudflare Worker: OpenAI proxy for the L'Oreal Routine Advisor
 * -----------------------------------------------------------------
 * This keeps your OpenAI API key off the client. The front end calls
 * this worker; the worker calls OpenAI using a secret bound to the
 * worker itself.
 *
 * DEPLOY STEPS
 * 1. npm install -g wrangler        (if you don't have it)
 * 2. wrangler login
 * 3. wrangler init loreal-routine-proxy   (or reuse an existing worker project;
 *    when prompted, choose "Hello World" worker, no need for a template)
 * 4. Copy this file's contents into the generated src/index.js (or worker.js)
 * 5. Set your secret (this is the secure part -- it's never in your code):
 *       wrangler secret put OPENAI_API_KEY
 *    (paste your OpenAI key when prompted)
 * 6. wrangler deploy
 * 7. Wrangler will print a URL like:
 *       https://loreal-routine-proxy.YOUR-SUBDOMAIN.workers.dev
 *    Put that URL into WORKER_ENDPOINT in script.js.
 */

// Once deployed, tighten this to your actual site origin,
// e.g. "https://your-username.github.io"
const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "'messages' array is required" }, 400);
    }

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.7,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        return jsonResponse({ error: `OpenAI error: ${errText}` }, 502);
      }

      const data = await openaiRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return jsonResponse({ content });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}