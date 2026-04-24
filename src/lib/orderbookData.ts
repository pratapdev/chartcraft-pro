export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  maxVol: number;
}

class OrderBookManager {
  private listeners: { [event: string]: Function[] } = {};
  
  on(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  
  off(event: string, fn: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== fn);
  }
  
  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(fn => fn(...args));
  }

  private symbol: string | null = null;
  private ws: WebSocket | null = null;
  
  // Local active mapped book
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private lastUpdateId = 0;
  private isInitializing = false;
  private pendingQueue: any[] = [];
  
  // History of snapshots for the heatmap
  public history: OrderBookSnapshot[] = [];
  private readonly MAX_HISTORY = 3000; // Store up to 3000 ticks
  
  private snapshotInterval: any = null;

  connect(symbol: string) {
    if (this.symbol === symbol) return;
    this.disconnect();
    
    this.symbol = symbol;
    this.bids.clear();
    this.asks.clear();
    this.history = [];
    this.pendingQueue = [];
    this.isInitializing = true;
    
    // Convert e.g., "BTC/USD" or "BTC/USDT" to "btcusdt"
    const formattedSymbol = symbol.replace('/', '').toLowerCase();
    // Default to USDT if just BTC/USD is given as Binance pairs usually have USDT
    const binanceSymbol = formattedSymbol.endsWith('usd') ? formattedSymbol + 't' : formattedSymbol;
    
    // Let's use @depth stream for real time deltas
    this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@depth@100ms`);
    
    // Always start snapshotting
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.snapshotInterval = setInterval(() => this.captureSnapshot(), 500);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.e === 'depthUpdate') {
        if (this.isInitializing) {
           this.pendingQueue.push(data);
        } else {
           this.processDelta(data);
        }
      }
    };
    
    // Fetch initial snapshot
    fetch(`https://api.binance.com/api/v3/depth?symbol=${binanceSymbol.toUpperCase()}&limit=500`)
      .then(res => res.json())
      .then(snapshot => {
         this.lastUpdateId = snapshot.lastUpdateId;
         
         snapshot.bids.forEach(([p, q]: [string, string]) => this.bids.set(parseFloat(p), parseFloat(q)));
         snapshot.asks.forEach(([p, q]: [string, string]) => this.asks.set(parseFloat(p), parseFloat(q)));
         
         // Process queues
         while (this.pendingQueue.length > 0) {
            const ev = this.pendingQueue.shift();
            if (ev.u <= this.lastUpdateId) continue;
            this.processDelta(ev);
         }
      })
      .catch(err => {
         console.error("Failed to fetch initial depth", err);
         this.isInitializing = false;
      });
  }
  
  private processDelta(data: any) {
    // Drop older events
    if (data.u <= this.lastUpdateId) return;
    
    data.b.forEach(([p, q]: [string, string]) => {
       const price = parseFloat(p);
       const qty = parseFloat(q);
       if (qty === 0) this.bids.delete(price);
       else this.bids.set(price, qty);
    });
    
    data.a.forEach(([p, q]: [string, string]) => {
       const price = parseFloat(p);
       const qty = parseFloat(q);
       if (qty === 0) this.asks.delete(price);
       else this.asks.set(price, qty);
    });
    
    this.lastUpdateId = data.u;
  }
  
  private captureSnapshot() {
    if (this.bids.size === 0 && this.asks.size === 0) return;
    
    // Convert to sorted arrays and clip to top 200 levels to save memory
    const bidsArr = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0]) // descending
      .slice(0, 200)
      .map(([price, quantity]) => ({ price, quantity }));
      
    const asksArr = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0]) // ascending
      .slice(0, 200)
      .map(([price, quantity]) => ({ price, quantity }));
      
    // Find max vol in this snapshot to scale colors
    let max = 0;
    for (const b of bidsArr) if (b.quantity > max) max = b.quantity;
    for (const a of asksArr) if (a.quantity > max) max = a.quantity;
      
    const snap: OrderBookSnapshot = {
       timestamp: Date.now() / 1000,
       bids: bidsArr,
       asks: asksArr,
       maxVol: max
    };
    
    this.history.push(snap);
    if (this.history.length > this.MAX_HISTORY) {
       this.history.shift();
    }
    
    this.emit('snapshot', snap);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    this.symbol = null;
    this.history = [];
    this.bids.clear();
    this.asks.clear();
  }
}

export const orderBookManager = new OrderBookManager();
