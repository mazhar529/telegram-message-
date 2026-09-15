const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "NexaVoice Thinnest AI → Telegram",
    ai: OPENROUTER_MODEL
  });
});

app.post("/api/thinnest/call-ended", async (req, res) => {
  try {
    if (WEBHOOK_SECRET) {
      const supplied = req.get("x-webhook-secret") || req.get("authorization")?.replace(/^Bearer\\s+/i, "");
      if (supplied !== WEBHOOK_SECRET) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
    }

    const payload = req.body || {};

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ ok: false, error: "Telegram environment variables are missing" });
    }
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ ok: false, error: "OPENROUTER_API_KEY is missing" });
    }

    const input = extractCallData(payload);
    const lead = await analyzeLead(input);

    const message = buildTelegramMessage(lead, input);
    const telegram = await sendTelegram(message);

    res.status(200).json({
      ok: true,
      telegram_message_id: telegram?.result?.message_id || null,
      lead
    });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ ok: false, error: "Processing failed" });
  }
});

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

async function analyzeLead(input) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      priority: { type: "string", enum: ["High", "Medium", "Low"] },
      name: { type: "string" },
      business: { type: "string" },
      service: { type: "string" },
      budget: { type: "string" },
      timeline: { type: "string" },
      summary: { type: "string" }
    },
    required: ["priority", "name", "business", "service", "budget", "timeline", "summary"]
  };

  const prompt = `You are a lead-extraction assistant for NexaVoice.
Extract ONLY information explicitly supported by the call data below.
Never invent, infer a name/business/service/budget/timeline that was not stated.
Use "-" when information is unavailable.

Priority rules:
- High: clear buying intent, urgent timeline, appointment/quote requested, or strong qualified lead.
- Medium: genuine interest but missing important qualification or not ready yet.
- Low: weak interest, wrong number, spam, no meaningful lead, or insufficient evidence.
Be conservative.

Return ONLY the requested JSON structure.

CALL DATA:
Caller: ${input.caller}
Duration: ${input.duration}
Existing summary: ${input.directSummary}
Transcript:
${input.transcript || "(No transcript supplied)"}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://render.com",
      "X-Title": "NexaVoice Lead Telegram"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: "Extract structured lead data accurately. Do not hallucinate." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "lead", strict: true, schema }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("OpenRouter error:", data);
    throw new Error("OpenRouter request failed");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no content");

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error("AI returned invalid JSON"); }

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
