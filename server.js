const express = require("express");

const app = express();
app.use(express.json({ limit: "4mb" }));

const PORT = process.env.PORT || 10000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.THINNEST_WEBHOOK_SECRET;
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:20b";
const REQUIRE_AI = process.env.REQUIRE_AI !== "false";
const MAX_AI_INPUT_CHARS = Number(process.env.MAX_AI_INPUT_CHARS || 30000);

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "NexaVoice Thinnest AI -> Telegram", ai: "local Ollama" });
});

// Use this URL in Thinnest AI as its webhook/endpoint:
// POST https://YOUR-DOMAIN/api/thinnest/call-ended
app.post("/api/thinnest/call-ended", async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const payload = req.body || {};
    console.log("Received Thinnest AI call-ended webhook");

    const lead = await extractLeadWithLocalAI(payload);
    const message = buildTelegramMessage(lead);

    const telegram = await sendTelegram(message);
    return res.status(200).json({
      ok: true,
      telegram_message_id: telegram?.result?.message_id || null,
      lead
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

// Backward-compatible endpoint with the old project.
app.post("/api/call-summary", async (req, res) => {
  try {
    if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const lead = await extractLeadWithLocalAI(req.body || {});
    const telegram = await sendTelegram(buildTelegramMessage(lead));
    return res.status(200).json({ ok: true, telegram_message_id: telegram?.result?.message_id || null, lead });
  } catch (error) {
    console.error("Summary endpoint error:", error);
    return res.status(500).json({ ok: false, error: error.message || "Internal server error" });
  }
});

function isAuthorized(req) {
  if (!WEBHOOK_SECRET) return true;
  const supplied = req.get("x-thinnest-webhook-secret") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === WEBHOOK_SECRET;
}

function clean(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  return String(value).trim();
}

function formatDuration(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const seconds = Math.max(0, Math.round(Number(value)));
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return clean(value);
}

function normalizePriority(value) {
  const p = clean(value).toLowerCase();
  if (p.includes("high") || p.includes("urgent") || p.includes("hot")) return "High";
  if (p.includes("medium") || p.includes("warm")) return "Medium";
  return "Low";
}

function priorityIcon(priority) {
  return priority === "High" ? "🔴" : priority === "Medium" ? "🟡" : "🟢";
}

function buildTelegramMessage(lead) {
  const priority = normalizePriority(lead.priority);
  return `${priorityIcon(priority)} NexaVoice Call Ended — Priority: ${priority}

📞 Caller: ${clean(lead.caller)}
⏱️ Duration: ${formatDuration(lead.duration)}
👤 Name: ${clean(lead.name)}
🏢 Business: ${clean(lead.business)}
🛠️ Service: ${clean(lead.service)}
💰 Budget: ${clean(lead.budget)}
📅 Timeline: ${clean(lead.timeline)}

📝 Summary: ${clean(lead.summary)}`;
}

async function extractLeadWithLocalAI(payload) {
  const source = sanitizeForModel(payload);
  const schema = {
    type: "object",
    properties: {
      priority: { type: "string", enum: ["High", "Medium", "Low"] },
      caller: { type: "string" },
      duration: { type: "string" },
      name: { type: "string" },
      business: { type: "string" },
      service: { type: "string" },
      budget: { type: "string" },
      timeline: { type: "string" },
      summary: { type: "string" }
    },
    required: ["priority", "caller", "duration", "name", "business", "service", "budget", "timeline", "summary"]
  };

  const prompt = `You are a lead-data extraction system for a business phone agent.
Extract ONLY facts present in the supplied Thinnest AI call payload/transcript.
Never invent or guess missing values. If a field is not available, use "-".
Priority rules: High = strong buying intent/urgent/ready to proceed; Medium = genuine interest but not ready; Low = weak, unclear, wrong number, spam, or no buying intent.
Keep summary concise (1-3 sentences). Preserve the caller's stated budget and timeline without inventing currency or dates.
Return JSON only matching the schema.

THINNEST AI PAYLOAD:
${source}`;

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      temperature: 0,
      messages: [
        { role: "system", content: "You extract structured lead data. Never fabricate personal or business information." },
        { role: "user", content: prompt }
      ],
      format: schema
    })
  });

  if (!response.ok) {
    const text = await response.text();
    if (REQUIRE_AI) throw new Error(`Local AI unavailable (${response.status}): ${text.slice(0, 500)}`);
    return deterministicFallback(payload);
  }

  const data = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(data?.message?.content || "{}");
  } catch {
    throw new Error("Local AI returned invalid JSON");
  }

  return {
    priority: normalizePriority(parsed.priority),
    caller: clean(parsed.caller),
    duration: clean(parsed.duration),
    name: clean(parsed.name),
    business: clean(parsed.business),
    service: clean(parsed.service),
    budget: clean(parsed.budget),
    timeline: clean(parsed.timeline),
    summary: clean(parsed.summary)
  };
}

function sanitizeForModel(payload) {
  const text = JSON.stringify(payload, null, 2);
  return text.length > MAX_AI_INPUT_CHARS ? text.slice(0, MAX_AI_INPUT_CHARS) + "\n[TRUNCATED]" : text;
}

// Only used if REQUIRE_AI=false. It does not use an external AI service.
function deterministicFallback(p) {
  const first = (...paths) => {
    for (const path of paths) {
      let v = p;
      for (const key of path.split(".")) v = v == null ? undefined : v[key];
      if (v !== undefined && v !== null && String(v).trim()) return v;
    }
    return "-";
  };
  return {
    priority: normalizePriority(first("priority", "data.priority", "summary.priority")),
    caller: clean(first("caller", "caller_number", "callerNumber", "phoneNumber", "phone", "data.caller")),
    duration: formatDuration(first("duration", "call_duration", "callDuration", "data.duration")),
    name: clean(first("name", "customer_name", "customerName", "data.name")),
    business: clean(first("business", "business_name", "businessName", "company", "data.business")),
    service: clean(first("service", "service_required", "serviceRequired", "data.service")),
    budget: clean(first("budget", "customer_budget", "data.budget")),
    timeline: clean(first("timeline", "customer_timeline", "data.timeline")),
    summary: clean(first("summary", "call_summary", "summary_text", "data.call_summary", "data.summary"))
  };
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(data)}`);
  }
  return data;
}

app.listen(PORT, () => {
  console.log(`NexaVoice Thinnest AI -> Telegram listening on port ${PORT}`);
  console.log(`Webhook: POST /api/thinnest/call-ended`);
  console.log(`Local AI: ${OLLAMA_URL} / ${OLLAMA_MODEL}`);
});
