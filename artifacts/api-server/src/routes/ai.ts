import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

interface ChartContext {
  symbol?: string;
  timeframe?: string;
  indicators?: Array<{ type: string; period?: number }>;
  recentCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  marketType?: string;
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

interface AIChatBody {
  message: string;
  context?: ChartContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function buildSystemPrompt(ctx?: ChartContext): string {
  const parts: string[] = [
    "You are an expert AI trading analyst and strategy advisor embedded inside a professional trading chart platform.",
    "You help traders analyze charts, identify setups, and refine their strategies.",
    "Be concise, specific, and actionable. Use markdown for structure where helpful.",
    "Focus on technical analysis — price action, indicators, trends, support/resistance, and risk management.",
  ];

  if (ctx) {
    if (ctx.symbol || ctx.timeframe) {
      parts.push(`\nCurrent chart: ${ctx.symbol ?? "unknown"} on ${ctx.timeframe ?? "unknown"} timeframe (${ctx.marketType ?? "crypto"} market).`);
    }

    if (ctx.indicators && ctx.indicators.length > 0) {
      const indList = ctx.indicators.map(i => `${i.type}${i.period ? `(${i.period})` : ""}`).join(", ");
      parts.push(`Active indicators: ${indList}.`);
    }

    if (ctx.recentCandles && ctx.recentCandles.length > 0) {
      const candles = ctx.recentCandles;
      const last = candles[candles.length - 1];
      const first = candles[0];
      const high = Math.max(...candles.map(c => c.high));
      const low = Math.min(...candles.map(c => c.low));
      const change = ((last.close - first.open) / first.open * 100).toFixed(2);
      const avgVol = (candles.reduce((s, c) => s + c.volume, 0) / candles.length).toFixed(0);

      parts.push(
        `\nRecent candle summary (last ${candles.length} bars):`,
        `  Open: ${first.open}, Current close: ${last.close}, Change: ${change}%`,
        `  Range high: ${high}, Range low: ${low}`,
        `  Avg volume: ${avgVol}`,
      );
    }

    if (ctx.patterns && ctx.patterns.length > 0) {
      parts.push(`\nDetected chart patterns (most recent first):`);
      for (const p of ctx.patterns) {
        parts.push(`  - ${p.label} | bias=${p.bias} | strength=${p.strength}${p.apexPrice ? ` | apex=${p.apexPrice.toFixed(2)}` : ''}`);
      }
    }

    if (ctx.structure) {
      const labels = ctx.structure.labels ?? [];
      const sweeps = ctx.structure.sweeps ?? [];
      if (labels.length > 0) {
        parts.push(`\nMarket structure events (recent):`);
        for (const l of labels) parts.push(`  - ${l.kind} ${l.direction} @ ${l.price}`);
      }
      if (sweeps.length > 0) {
        parts.push(`Liquidity sweeps (recent):`);
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
      if (lines.length > 0) parts.push(`\nDerivatives: ${lines.join(' | ')}`);
    }
  }

  return parts.join("\n");
}

type ProviderName = "openai" | "google" | "anthropic";

function resolveProvider(raw?: string): ProviderName {
  if (raw === "google" || raw === "anthropic") return raw;
  return "openai";
}

async function streamWithFetch(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  provider: ProviderName;
}) {
  const { baseUrl, apiKey, model, messages, provider } = params;
  const url = provider === "anthropic" ? `${baseUrl}/v1/messages` : `${baseUrl}/v1/chat/completions`;
  const body =
    provider === "anthropic"
      ? {
          model,
          max_tokens: 4096,
          messages: messages.map((m) => ({
            role: m.role === "system" ? "user" : m.role,
            content: m.role === "system" ? `System instructions:\n${m.content}` : m.content,
          })),
        }
      : {
          model,
          messages,
          stream: true,
        };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(provider === "anthropic" ? { "anthropic-version": "2023-06-01" } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Provider error: ${response.status}`);
  }

  return response.body;
}

router.post("/ai/chat", async (req: Request<object, object, AIChatBody>, res: Response) => {
  const { message, context, history = [], provider, apiKey, baseUrl, model } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const systemPrompt = buildSystemPrompt(context);
    const selectedProvider = resolveProvider(provider);
    const resolvedBaseUrl =
      baseUrl ||
      (selectedProvider === "anthropic"
        ? "https://api.anthropic.com"
        : selectedProvider === "google"
          ? "https://generativelanguage.googleapis.com"
          : "https://api.openai.com");
    const resolvedModel =
      model ||
      (selectedProvider === "anthropic"
        ? "claude-3-5-sonnet-latest"
        : selectedProvider === "google"
          ? "gemini-1.5-pro"
          : "gpt-5.1");

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    if (selectedProvider === "openai" && !apiKey) {
      const stream = await openai.chat.completions.create({
        model: resolvedModel,
        max_completion_tokens: 8192,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    } else {
      const body = await streamWithFetch({
        baseUrl: resolvedBaseUrl,
        apiKey,
        model: resolvedModel,
        messages,
        provider: selectedProvider,
      });
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const content =
                parsed?.choices?.[0]?.delta?.content ||
                parsed?.content?.[0]?.text ||
                parsed?.content ||
                "";
              if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
            } catch {}
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    req.log.error({ error: msg }, "AI chat error");
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

export default router;
