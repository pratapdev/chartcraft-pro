import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, Loader2, ChevronDown, Sparkles, TrendingUp, Search, Lightbulb, RotateCcw } from 'lucide-react';
import { useChartStore } from '@/stores/chartStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

const QUICK_ACTIONS = [
  { label: 'Analyze chart', icon: TrendingUp, prompt: 'Analyze the current chart and give me a summary of the price action, trend, and key levels.' },
  { label: 'Find setups', icon: Search, prompt: 'Look at the current chart context and identify the best trading setups or opportunities right now.' },
  { label: 'Refine strategy', icon: Lightbulb, prompt: 'Based on my active indicators and the current chart, how can I refine my trading strategy?' },
];

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

async function streamChat(
  message: string,
  context: object,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const url = `${BASE_URL}/api/ai/chat`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history }),
  });

  if (!response.ok || !response.body) {
    onError(`Server error: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.error) { onError(data.error); return; }
        if (data.done) { onDone(); return; }
        if (data.content) onChunk(data.content);
      } catch {}
    }
  }
  onDone();
}

export const AISidekick: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chartShot, setChartShot] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { symbol, timeframe, indicators, candles, marketType } = useChartStore();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#chart-screenshot-source');
    setChartShot(canvas?.toDataURL('image/png') ?? null);
  }, []);

  const getContext = useCallback(() => {
    const recentCandles = candles.slice(-50).map(c => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));
    return {
      symbol,
      timeframe,
      marketType,
      indicators: indicators.filter(i => i.visible).map(i => ({ type: i.type, period: i.period })),
      recentCandles,
    };
  }, [symbol, timeframe, marketType, indicators, candles]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text.trim(), id: Date.now().toString() };
    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantMsg: Message = { role: 'assistant', content: '', id: assistantId };
    setMessages(prev => [...prev, assistantMsg]);

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      await streamChat(
        text.trim(),
        getContext(),
        history,
        (chunk) => {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
        },
        () => setLoading(false),
        (err) => {
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${err}` } : m));
          setLoading(false);
        },
      );
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${e instanceof Error ? e.message : String(e)}` } : m));
      setLoading(false);
    }
  }, [loading, messages, getContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatContent = (text: string) => {
    if (!text) return <span className="animate-pulse">▌</span>;
    return (
      <span className="whitespace-pre-wrap text-sm leading-relaxed">
        {text}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-l border-[#1c2333] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1c2333] bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles size={12} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white">AI Sidekick</span>
          <span className="text-[10px] text-gray-500 font-mono">{symbol} · {timeframe}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1 rounded hover:bg-[#1c2333] text-gray-500 hover:text-white transition-colors"
              title="Clear chat"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1c2333] text-gray-500 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {chartShot && (
        <div className="px-3 pt-3">
          <div className="rounded-lg overflow-hidden border border-[#1c2333] bg-[#161b27]">
            <img src={chartShot} alt="Current chart screenshot" className="w-full h-auto block" />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={10} className="text-white" />
              </div>
              <div className="bg-[#161b27] rounded-lg px-3 py-2 text-sm text-gray-300 leading-relaxed">
                Hi! I'm your AI trading assistant. I have access to your current chart — <span className="text-blue-400 font-mono">{symbol}</span> on <span className="text-blue-400 font-mono">{timeframe}</span>. Ask me anything about your chart or try a quick action below.
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-mono px-1">Quick actions</p>
              {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(prompt)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161b27] hover:bg-[#1c2333] border border-[#1c2333] hover:border-blue-800 text-left text-sm text-gray-300 hover:text-white transition-all group"
                >
                  <Icon size={13} className="text-blue-500 flex-shrink-0 group-hover:text-blue-400" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user'
                ? 'bg-blue-600'
                : 'bg-gradient-to-br from-blue-500 to-purple-600'
            }`}>
              {msg.role === 'user'
                ? <span className="text-[9px] text-white font-bold">U</span>
                : <Bot size={10} className="text-white" />
              }
            </div>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-blue-600/20 border border-blue-800/40 text-white'
                : 'bg-[#161b27] text-gray-200'
            }`}>
              {formatContent(msg.content)}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions (when chatting) */}
      {messages.length > 0 && !loading && (
        <div className="px-3 pb-1 flex gap-1.5 flex-wrap">
          {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              onClick={() => sendMessage(prompt)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#161b27] hover:bg-[#1c2333] border border-[#1c2333] text-gray-400 hover:text-white transition-all"
            >
              <Icon size={9} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 border-t border-[#1c2333]">
        <div className="flex items-end gap-2 bg-[#161b27] border border-[#1c2333] rounded-lg px-3 py-2 focus-within:border-blue-700 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the chart…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 resize-none outline-none min-h-[20px] max-h-[80px] leading-5"
            style={{ height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 80) + 'px';
            }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-7 h-7 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[9px] text-gray-700 mt-1 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
};
