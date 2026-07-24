/**
 * Cloudflare Worker: OpenAI proxy for the L'Oreal Routine Advisor
 * -----------------------------------------------------------------
 * Uses OpenAI's Responses API with the built-in `web_search` tool, so the
 * model can look things up on the live web (current trends, ingredient
 * research, product availability, etc.) before answering. Your OpenAI key
 * stays server-side here -- it never reaches the browser.
 *
 * DEPLOY STEPS
 * 1. npm install -g wrangler        (if you don't have it)
 * 2. wrangler login
 * 3. wrangler init loreal-routine-proxy   (or reuse an existing worker project)
 * 4. Copy this file's contents into src/index.js (or worker.js)
 * 5. Set your secret:
 *       wrangler secret put OPENAI_API_KEY
 *    (paste your real key when prompted -- never put it in this file)
 * 6. wrangler deploy
 * 7. Copy the printed URL into WORKER_ENDPOINT in script.js
 */

// Once deployed, tighten this to your actual site origin,
// e.g. "https://your-username.github.io"
const ALLOWED_ORIGIN = "*";

// Any Responses-API-compatible model works here. gpt-4.1 is a safe default;
// swap in a newer model if your account has access to one.
const MODEL = "gpt-4.1";

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

    // Guard against any message that somehow has null/undefined/non-string
    // content -- OpenAI rejects the whole request if even one entry is bad.
    const sanitizedMessages = messages
      .filter((m) => m && typeof m.role === "string")
      .map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
      }));

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          // Responses API accepts the same {role, content} shape as
          // Chat Completions, so the front end doesn't need to change.
          input: sanitizedMessages,
          tools: [{ type: "web_search_preview" }],
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.log("OpenAI request failed. Sent:", JSON.stringify(sanitizedMessages));
        console.log("OpenAI error response:", errText);
        return jsonResponse({ error: `OpenAI error: ${errText}` }, 502);
      }

      const data = await openaiRes.json();
      const content = extractResponseText(data);
      return jsonResponse({ content });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

/**
 * Pulls the plain-text answer (plus any web citations) out of a raw
 * Responses API payload. The official SDKs expose a convenience
 * `response.output_text` property; since we're calling the raw HTTP API
 * from the Worker, we reconstruct the same thing here.
 */
function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.length > 0) {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) return "";

  const messageItems = data.output.filter((item) => item.type === "message");
  const textParts = [];
  const sources = new Map();

  for (const item of messageItems) {
    for (const part of item.content || []) {
      if (part.type === "output_text") {
        textParts.push(part.text);
        for (const annotation of part.annotations || []) {
          if (annotation.type === "url_citation" && annotation.url) {
            sources.set(annotation.url, annotation.title || annotation.url);
          }
        }
      }
    }
  }

  let text = textParts.join("\n").trim();

  if (sources.size > 0) {
    const list = [...sources.entries()]
      .map(([url, title], i) => `${i + 1}. ${title} - ${url}`)
      .join("\n");
    text += `\n\nSources:\n${list}`;
  }

  return text;
}

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