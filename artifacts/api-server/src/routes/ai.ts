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
}

interface AIChatBody {
  message: string;
  context?: ChartContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
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
  }

  return parts.join("\n");
}

router.post("/ai/chat", async (req: Request<object, object, AIChatBody>, res: Response) => {
  const { message, context, history = [] } = req.body;

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

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
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
