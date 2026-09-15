const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

app.get("/health", (_req, res) => res.json({ ok: true, service: "nexavoice-webhook", ai: OPENROUTER_MODEL }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "NexaVoice Thinnest AI → OpenRouter → Telegram",
    ai: OPENROUTER_MODEL,
    ai_mode: "OpenRouter free model"
  });
});

async function processCall(payload) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Telegram environment variables are missing");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing");

    const input = extractCallData(payload);
    console.log("Processing call with OpenRouter free model:", OPENROUTER_MODEL);
    const lead = await analyzeLead(input);
    const message = buildTelegramMessage(lead, input);
    const telegram = await sendTelegram(message);
    console.log("Telegram message sent:", telegram?.result?.message_id || "unknown");
  } catch (err) {
    console.error("Background processing error:", err?.stack || err);
  }
}

function handleCallEnded(req, res) {
  const payload = req.body || {};
  res.status(200).json({ ok: true, accepted: true });
  setImmediate(() => processCall(payload));
}

app.post("/", handleCallEnded);
app.post("/api/thinnest/call-ended", handleCallEnded);

function clean(v) {
  if (v === undefined || v === null) return "-";
  const s = String(v).trim();
  return s || "-";
}

function findFirst(obj, keys, maxDepth = 8, depth = 0) {
  if (!obj || depth > maxDepth || typeof obj !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") return obj[key];
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findFirst(value, keys, maxDepth, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function collectText(obj, wantedKeys, out = [], depth = 0) {
  if (!obj || depth > 8) return out;
  if (Array.isArray(obj)) {
    for (const x of obj) collectText(x, wantedKeys, out, depth + 1);
    return out;
  }
  if (typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (wantedKeys.some(x => lk.includes(x)) && typeof v === "string" && v.trim()) out.push(v.trim());
    if (v && typeof v === "object") collectText(v, wantedKeys, out, depth + 1);
  }
  return out;
}

function extractCallData(p) {
  const transcript = [
    ...collectText(p, ["transcript", "conversation", "dialogue", "messages"]),
    ...collectText(p, ["recording_transcript"])
  ].join("\n");

  return {
    caller: clean(findFirst(p, ["caller", "caller_number", "callerNumber", "phoneNumber", "phone", "fromPhone", "from", "customer_phone"])),
    duration: clean(findFirst(p, ["duration", "call_duration", "callDuration", "duration_seconds", "durationSeconds"])),
    directSummary: clean(findFirst(p, ["summary", "call_summary", "summary_text"])),
    transcript: transcript.slice(0, 60000)
  };
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("AI returned no JSON");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function analyzeLead(input) {
  const prompt = `You are a sales-call lead extractor. Analyze the phone call and return ONLY one valid JSON object. Do not use markdown.

Rules:
- Never invent facts.
- If a field is not explicitly stated or strongly supported by the call, use "-".
- priority must be exactly "High", "Medium", or "Low".
- High = strong buying intent, urgent need, quote/appointment requested, or clearly qualified.
- Medium = genuine interest but qualification is incomplete or timing is uncertain.
- Low = weak interest, spam, wrong number, or insufficient buying evidence.
- summary must be one concise factual sentence.
- Keep values short and preserve the caller's wording/currency where possible.

Return exactly these keys:
{"priority":"High|Medium|Low","name":"-","business":"-","service":"-","budget":"-","timeline":"-","summary":"-"}

CALLER: ${input.caller}
DURATION: ${input.duration}
EXISTING SUMMARY: ${input.directSummary}
TRANSCRIPT:
${input.transcript || "(No transcript supplied)"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://telegram-message-xcnw.onrender.com",
        "X-Title": "NexaVoice Lead Telegram"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: "Return only valid JSON. You extract factual sales lead fields and never invent missing information." },
          { role: "user", content: prompt }
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        provider: {
          require_parameters: true,
          data_collection: "deny",
          sort: "latency",
          allow_fallbacks: true
        }
      }),
      signal: controller.signal
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenRouter error:", JSON.stringify(data));
      throw new Error(`OpenRouter request failed (${response.status})`);
    }

    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    return {
      priority: ["High", "Medium", "Low"].includes(parsed.priority) ? parsed.priority : "Low",
      name: clean(parsed.name),
      business: clean(parsed.business),
      service: clean(parsed.service),
      budget: clean(parsed.budget),
      timeline: clean(parsed.timeline),
      summary: clean(parsed.summary)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatDuration(v) {
  if (v === "-" || v === "") return "-";
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
    const seconds = Math.max(0, Math.round(Number(v)));
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return clean(v);
}

function buildTelegramMessage(lead, input) {
  const p = lead.priority;
  const icon = p === "High" ? "🔴" : p === "Medium" ? "🟡" : "🟢";
  return `${icon} NexaVoice Call Ended — Priority: ${p}\n\n📞 Caller: ${clean(input.caller)}\n⏱️ Duration: ${formatDuration(input.duration)}\n👤 Name: ${lead.name}\n🏢 Business: ${lead.business}\n🛠️ Service: ${lead.service}\n💰 Budget: ${lead.budget}\n📅 Timeline: ${lead.timeline}\n\n📝 Summary: ${lead.summary}`;
}

async function sendTelegram(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    console.error("Telegram error:", data);
    throw new Error("Telegram send failed");
  }
  return data;
}

app.listen(PORT, () => console.log(`NexaVoice server listening on port ${PORT}`));
