// Tally speech-to-text: turns a short voice note into text when the phone's own speech
// service is missing or broken (iPhone home-screen app, Firefox, blocked Google speech).
//
// POST /transcribe?lang=id   body: 16 kHz mono 16-bit PCM WAV made on the device (max 30 s)
//   -> { text, lang }
// GET  /health               -> { ok, model }
//
// Audio is transcribed and dropped; nothing is stored. Abuse limits: per-IP rate limit
// (Cloudflare rate-limiting binding) plus a daily cap counted in KV.

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO = 1_000_000; // 30 s at 32 KB/s plus header
const LANGS = ["id", "en", "ms", "zh", "ja", "ko", "th", "vi", "de", "fr", "nl", "es"];
const HINTS = {
  id: "Kopi 25 ribu, makan siang 45rb, Grab 32 ribu, bensin 100 ribu, belanja 1,5 juta kemarin.",
  en: "Coffee 25k, lunch 45,000, Grab 32k, petrol 100k, groceries 1.5 million yesterday.",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("Origin") || "", env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, model: MODEL }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/transcribe") {
        return json(await transcribe(request, env, url), 200, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) {
        console.error("tally-api", err && err.stack ? err.stack : err);
      }
      return json({ error: err.status ? err.message : "Server error" }, status, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function transcribe(request, env, url) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) {
      throw new HttpError(429, "Too many voice entries — wait a minute or type it");
    }
  }
  const day = new Date().toISOString().slice(0, 10);
  const dailyCap = parseInt(env.DAILY_LIMIT || "3000", 10);
  let used = 0;
  if (env.COUNTS) {
    used = parseInt((await env.COUNTS.get("stt:" + day)) || "0", 10);
    if (used >= dailyCap) {
      throw new HttpError(429, "Voice is busy today — type it for now");
    }
  }

  const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_AUDIO) {
    throw new HttpError(413, "Recording too long");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_AUDIO) {
    throw new HttpError(413, "Recording too long");
  }
  const isWav = bytes.length > 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  if (!isWav) {
    throw new HttpError(400, "Send a WAV recording");
  }

  const lang = LANGS.includes((url.searchParams.get("lang") || "").slice(0, 2))
    ? url.searchParams.get("lang").slice(0, 2)
    : undefined;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }

  let result;
  try {
    result = await env.AI.run(MODEL, {
      audio: btoa(binary),
      task: "transcribe",
      language: lang,
      vad_filter: true,
      initial_prompt: HINTS[lang] || HINTS.en,
    });
  } catch (err) {
    console.error("whisper error", err && err.message);
    throw new HttpError(502, "Could not hear that — try again or type it");
  }

  if (env.COUNTS) {
    // Approximate daily counter (KV is eventually consistent; good enough for a safety cap).
    await env.COUNTS.put("stt:" + day, String(used + 1), { expirationTtl: 3 * 86400 });
  }
  const text = String((result && result.text) || "").replace(/\s+/g, " ").trim();
  const heardLang = result && result.transcription_info ? result.transcription_info.language : lang;
  return { text, lang: heardLang || "" };
}

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(payload, status, extra) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
