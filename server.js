const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const LOCAL_MODEL = process.env.LOCAL_MODEL || "HuggingFaceTB/SmolLM2-360M-Instruct";
let generatorPromise;

app.get("/health", (_req, res) => res.json({ ok: true, service: "nexavoice-webhook" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "NexaVoice Thinnest AI → Telegram",
    ai: LOCAL_MODEL,
    ai_mode: "self-hosted open-source model; no AI API key required"
  });
});

async function processCall(payload) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      throw new Error("Telegram environment variables are missing");
    }
    const input = extractCallData(payload);
    console.log("Processing call in background...");
    const lead = await analyzeLead(input);
    const message = buildTelegramMessage(lead, input);
    const telegram = await sendTelegram(message);
    console.log("Telegram message sent:", telegram?.result?.message_id || "unknown");
  } catch (err) {
    console.error("Background processing error:", err);
  }
}

function handleCallEnded(req, res) {
  // Acknowledge immediately so Thinnest AI does not time out while the local model loads.
  const payload = req.body || {};
  res.status(200).json({ ok: true, accepted: true });

  // Continue after the HTTP response has been sent.
  setImmediate(() => processCall(payload));
}

// Thinnest AI can POST to either URL. No webhook/API secret is required.
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
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
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
  ].join("\\n");

  return {
    caller: clean(findFirst(p, ["caller", "caller_number", "callerNumber", "phoneNumber", "phone", "fromPhone", "from", "customer_phone"])),
    duration: clean(findFirst(p, ["duration", "call_duration", "callDuration", "duration_seconds", "durationSeconds"])),
    directSummary: clean(findFirst(p, ["summary", "call_summary", "summary_text"])),
    transcript: transcript.slice(0, 50000),
    raw: p
  };
}

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      console.log(`Loading free open-source model: ${LOCAL_MODEL}`);
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("text-generation", LOCAL_MODEL, { dtype: "q8" });
    })();
  }
  return generatorPromise;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("AI returned no JSON");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function analyzeLead(input) {
  const prompt = `You extract sales lead information from a phone call. Return ONLY valid JSON.
Rules:
- Never invent information.
- If a field was not explicitly stated, use "-".
- priority must be exactly High, Medium, or Low.
- High = strong buying intent, urgent need, appointment/quote requested, or clearly qualified.
- Medium = genuine interest but missing qualification or not ready.
- Low = weak interest, spam, wrong number, or insufficient evidence.
- summary must be one short factual sentence.

JSON keys exactly:
priority, name, business, service, budget, timeline, summary

CALLER: ${input.caller}
DURATION: ${input.duration}
EXISTING SUMMARY: ${input.directSummary}
TRANSCRIPT:
${input.transcript || "(No transcript supplied)"}

JSON:`;

  const generator = await getGenerator();
  const output = await generator(prompt, {
    max_new_tokens: 220,
    do_sample: false,
    return_full_text: false
  });

  const text = output?.[0]?.generated_text || "";
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (e) {
    console.error("Local model output:", text);
    throw new Error("Local AI returned invalid JSON");
  }

  return {
    priority: ["High", "Medium", "Low"].includes(parsed.priority) ? parsed.priority : "Low",
    name: clean(parsed.name),
    business: clean(parsed.business),
    service: clean(parsed.service),
    budget: clean(parsed.budget),
    timeline: clean(parsed.timeline),
    summary: clean(parsed.summary)
  };
}

function formatDuration(v) {
  if (v === "-" || v === "") return "-";
  if (typeof v === "number" || /^\\d+(\\.\\d+)?$/.test(String(v))) {
    const seconds = Math.max(0, Math.round(Number(v)));
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return clean(v);
}

function buildTelegramMessage(lead, input) {
  const p = lead.priority;
  const icon = p === "High" ? "🔴" : p === "Medium" ? "🟡" : "🟢";

  return `${icon} NexaVoice Call Ended — Priority: ${p}

📞 Caller: ${clean(input.caller)}
⏱️ Duration: ${formatDuration(input.duration)}
👤 Name: ${lead.name}
🏢 Business: ${lead.business}
🛠️ Service: ${lead.service}
💰 Budget: ${lead.budget}
📅 Timeline: ${lead.timeline}

📝 Summary: ${lead.summary}`;
}

async function sendTelegram(text) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text
      })
    }
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    console.error("Telegram error:", data);
    throw new Error("Telegram send failed");
  }
  return data;
}

app.listen(PORT, () => {
  console.log(`NexaVoice server listening on port ${PORT}`);
});
