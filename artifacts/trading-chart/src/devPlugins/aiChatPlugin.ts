import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

interface ChartContext {
  symbol?: string;
  timeframe?: string;
  marketType?: string;
  indicators?: Array<{ type: string; period?: number }>;
  recentCandles?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  patterns?: Array<{ label: string; bias: string; strength: number; startTime: number; endTime: number; apexPrice?: number }>;
  structure?: {
    labels?: Array<{ kind: string; direction: string; price: number; breakTime: number }>;
    sweeps?: Array<{ direction: string; sweptPrice: number; time: number }>;
  };
  marketStats?: {
    openInterest?: number;
    openInterestChange24h?: number;
    fundingRate?: number;
    longShortRatio?: number;
    markPrice?: number;
  };
}

interface ChatBody {
  message: string;
  context?: ChartContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
}

function buildSystemPrompt(ctx?: ChartContext): string {
  const parts: string[] = [
    "You are an expert AI trading analyst embedded in a professional trading chart platform.",
    "Be concise, specific, and actionable. Use markdown for structure where helpful.",
    "Focus on technical analysis — price action, indicators, trends, support/resistance, risk management.",
  ];
  if (!ctx) return parts.join("\n");

  if (ctx.symbol || ctx.timeframe) {
    parts.push(`\nCurrent chart: ${ctx.symbol ?? "unknown"} on ${ctx.timeframe ?? "unknown"} (${ctx.marketType ?? "crypto"}).`);
  }
  if (ctx.indicators?.length) {
    parts.push(`Active indicators: ${ctx.indicators.map(i => `${i.type}${i.period ? `(${i.period})` : ""}`).join(", ")}.`);
  }
  if (ctx.recentCandles?.length) {
    const c = ctx.recentCandles;
    const last = c[c.length - 1];
    const first = c[0];
    const high = Math.max(...c.map(x => x.high));
    const low = Math.min(...c.map(x => x.low));
    const change = ((last.close - first.open) / first.open * 100).toFixed(2);
    const avgVol = (c.reduce((s, x) => s + x.volume, 0) / c.length).toFixed(0);
    parts.push(`\nRecent candles (${c.length} bars): open=${first.open}, close=${last.close}, change=${change}%, high=${high}, low=${low}, avgVol=${avgVol}`);
  }
  if (ctx.patterns?.length) {
    parts.push(`\nDetected chart patterns:`);
    for (const p of ctx.patterns) {
      parts.push(`  - ${p.label} | bias=${p.bias} | strength=${p.strength}${p.apexPrice ? ` | apex=${p.apexPrice.toFixed(2)}` : ""}`);
    }
  }
  if (ctx.structure) {
    const labels = ctx.structure.labels ?? [];
    const sweeps = ctx.structure.sweeps ?? [];
    if (labels.length) {
      parts.push(`\nMarket structure events:`);
      for (const l of labels) parts.push(`  - ${l.kind} ${l.direction} @ ${l.price}`);
    }
    if (sweeps.length) {
      parts.push(`Liquidity sweeps:`);
      for (const s of sweeps) parts.push(`  - ${s.direction} swept ${s.sweptPrice}`);
    }
  }
  if (ctx.marketStats) {
    const m = ctx.marketStats;
    const lines: string[] = [];
    if (m.openInterest != null) lines.push(`OI=${m.openInterest.toFixed(0)}`);
    if (m.openInterestChange24h != null) lines.push(`OI 24h=${m.openInterestChange24h.toFixed(2)}%`);
    if (m.fundingRate != null) lines.push(`funding=${(m.fundingRate * 100).toFixed(4)}%`);
    if (m.longShortRatio != null) lines.push(`L/S=${m.longShortRatio.toFixed(2)}`);
    if (m.markPrice != null) lines.push(`mark=${m.markPrice}`);
    if (lines.length) parts.push(`\nDerivatives: ${lines.join(" | ")}`);
  }
  return parts.join("\n");
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sse(res: ServerResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function aiChatPlugin(): Plugin {
  return {
    name: "lovable-ai-chat-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/ai/chat", async (req, res) => {
        if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "LOVABLE_API_KEY is not set on the dev server" }));
          return;
        }

        try {
          const body = await readJson<ChatBody>(req);
          const { message, context, history = [], model } = body;
          if (!message?.trim()) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "message is required" }));
            return;
          }

          const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
            { role: "system", content: buildSystemPrompt(context) },
            ...history.slice(-10),
            { role: "user", content: message },
          ];

          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model || "google/gemini-3-flash-preview",
              messages,
              stream: true,
            }),
          });

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => "");
            sse(res, { error: `Upstream ${upstream.status}: ${text.slice(0, 200)}` });
            res.end();
            return;
          }

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const content = parsed?.choices?.[0]?.delta?.content;
                if (content) sse(res, { content });
              } catch { /* ignore */ }
            }
          }
          sse(res, { done: true });
          res.end();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          try { sse(res, { error: msg }); res.end(); } catch { /* ignore */ }
        }
      });
    },
  };
}
