import React, { useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { AlertConditionRule, CompoundAlert, AlertTemplate } from '@/types/compoundAlerts';
import { Plus, Trash2, Save, BookTemplate, Send, MessageSquare } from 'lucide-react';

import { Timeframe } from '@/types/trading';

const CONDITION_TYPES = [
  { value: 'price_above', label: 'Price Above' },
  { value: 'price_below', label: 'Price Below' },
  { value: 'rsi_above', label: 'RSI Above' },
  { value: 'rsi_below', label: 'RSI Below' },
  { value: 'ema_above', label: 'EMA Above Price' },
  { value: 'ema_below', label: 'EMA Below Price' },
] as const;

const needsPeriod = (type: string) => type.startsWith('rsi') || type.startsWith('ema');

export const CompoundAlertForm: React.FC = () => {
  const { symbol, timeframe, addCompoundAlert } = useChartStore();
  const [conditions, setConditions] = useState<AlertConditionRule[]>([]);

  const [expanded, setExpanded] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);


  const addCondition = () => {
    setConditions([...conditions, { type: 'price_above', value: 0, period: 14 }]);
  };

  const updateCondition = (idx: number, updates: Partial<AlertConditionRule>) => {
    setConditions(conditions.map((c, i) => i === idx ? { ...c, ...updates } : c));
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const handleCreate = () => {
    if (conditions.length === 0) return;
    const alert: CompoundAlert = {
      id: `compound-${Date.now()}`,
      symbol,
      timeframe,
      conditions: [...conditions],
      active: true,
      triggered: false,
      createdAt: Date.now(),
      telegramEnabled,
      whatsappEnabled,
      message: conditions.map(c => `${c.type.replace('_', ' ')} ${c.value}${c.period ? ` (${c.period})` : ''}`).join(' AND '),

    };
    addCompoundAlert(alert);
    setConditions([]);
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5 text-primary rounded">
        <Plus size={12} />
        Multi-Condition Alert
      </button>
    );
  }

  return (
    <div className="panel-section rounded p-2 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Multi-Condition Alert</span>
        <span className="text-[10px] text-muted-foreground">{symbol} · {timeframe}</span>
      </div>

      {conditions.map((c, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          {idx > 0 && <span className="text-[9px] text-primary font-bold">AND</span>}
          <select
            value={c.type}
            onChange={(e) => updateCondition(idx, { type: e.target.value as AlertConditionRule['type'] })}
            className="bg-accent text-foreground text-xs px-1.5 py-1 rounded outline-none flex-1"
          >
            {CONDITION_TYPES.map(ct => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={c.value}
            onChange={(e) => updateCondition(idx, { value: parseFloat(e.target.value) || 0 })}
            className="w-20 bg-accent text-foreground text-xs px-1.5 py-1 rounded outline-none text-right"
            placeholder="Value"
          />
          {needsPeriod(c.type) && (
            <input
              type="number"
              value={c.period || 14}
              onChange={(e) => updateCondition(idx, { period: parseInt(e.target.value) || 14 })}
              className="w-12 bg-accent text-foreground text-xs px-1.5 py-1 rounded outline-none text-right"
              placeholder="P"
              title="Period"
            />
          )}
          <button onClick={() => removeCondition(idx)} className="text-muted-foreground hover:text-destructive">
            <Trash2 size={10} />
          </button>
        </div>
      ))}

      <div className="flex gap-1.5">
        <button onClick={addCondition} className="flex items-center gap-1 text-primary text-[10px] hover:opacity-80">
          <Plus size={10} /> Add Condition
        </button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <Send size={9} className={telegramEnabled ? 'text-primary' : 'text-muted-foreground'} />
          <input
            type="checkbox"
            checked={telegramEnabled}
            onChange={(e) => setTelegramEnabled(e.target.checked)}
            className="w-3 h-3 accent-primary"
          />
          TG
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <MessageSquare size={9} className={whatsappEnabled ? 'text-primary' : 'text-muted-foreground'} />
          <input
            type="checkbox"
            checked={whatsappEnabled}
            onChange={(e) => setWhatsappEnabled(e.target.checked)}
            className="w-3 h-3 accent-primary"
          />
          WA
        </label>
      </div>


      <div className="flex gap-1.5 pt-1">
        <button
          onClick={handleCreate}
          disabled={conditions.length === 0}
          className="flex-1 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Create Alert
        </button>
        <button onClick={() => { setExpanded(false); setConditions([]); }} className="text-xs py-1.5 px-2 rounded bg-accent text-foreground hover:opacity-80">
          Cancel
        </button>
      </div>
    </div>
  );
};

export const CompoundAlertsList: React.FC = () => {
  const { compoundAlerts, removeCompoundAlert } = useChartStore();
  const active = compoundAlerts.filter(a => a.active && !a.triggered);

  if (active.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1">
        Multi-Condition Alerts ({active.length})
      </div>
      {active.map(alert => (
        <div key={alert.id} className="panel-section rounded p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-foreground font-medium">
              {alert.symbol} · {alert.timeframe} · {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => useChartStore.getState().updateCompoundAlert(alert.id, { telegramEnabled: !(alert.telegramEnabled ?? true) })}
                className={`transition-colors ${(alert.telegramEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                title={`Telegram ${(alert.telegramEnabled ?? true) ? 'ON' : 'OFF'}`}
              >
                <Send size={10} />
              </button>

              <button
                onClick={() => useChartStore.getState().updateCompoundAlert(alert.id, { whatsappEnabled: !(alert.whatsappEnabled ?? true) })}
                className={`transition-colors ${(alert.whatsappEnabled ?? true) ? 'text-primary' : 'text-muted-foreground'}`}
                title={`WhatsApp ${(alert.whatsappEnabled ?? true) ? 'ON' : 'OFF'}`}
              >
                <MessageSquare size={10} />
              </button>

              <button onClick={() => removeCompoundAlert(alert.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 size={10} />
              </button>
            </div>

          </div>
          <div className="text-muted-foreground mt-0.5 leading-relaxed">
            {alert.conditions.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="text-primary font-bold"> AND </span>}
                {c.type.replace('_', ' ')} {c.value}{c.period ? ` (${c.period})` : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const AlertTemplatesSection: React.FC = () => {
  const { alertTemplates, addAlertTemplate, removeAlertTemplate, addCompoundAlert, symbol, timeframe } = useChartStore();
  const [savingFrom, setSavingFrom] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');

  const compoundAlerts = useChartStore(s => s.compoundAlerts);

  const handleSaveTemplate = (alert: CompoundAlert) => {
    const template: AlertTemplate = {
      id: `tpl-${Date.now()}`,
      name: templateName || `Template ${alertTemplates.length + 1}`,
      conditions: alert.conditions,
      timeframe: alert.timeframe,
      createdAt: Date.now(),
    };
    addAlertTemplate(template);
    setSavingFrom(null);
    setTemplateName('');
  };

  const handleApplyTemplate = (tpl: AlertTemplate) => {
    const alert: CompoundAlert = {
      id: `compound-${Date.now()}`,
      symbol,
      timeframe: tpl.timeframe,
      conditions: [...tpl.conditions],
      active: true,
      triggered: false,
      createdAt: Date.now(),
      message: `From template: ${tpl.name}`,
    };
    addCompoundAlert(alert);
  };

  return (
    <div className="space-y-1.5">
      {/* Save from existing */}
      {compoundAlerts.filter(a => a.active).length > 0 && (
        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1 mt-2">
          Save as Template
        </div>
      )}
      {compoundAlerts.filter(a => a.active).map(alert => (
        <div key={alert.id} className="flex items-center gap-1 px-1">
          {savingFrom === alert.id ? (
            <>
              <input
                type="text"
                placeholder="Template name..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="flex-1 bg-accent text-foreground text-xs px-2 py-1 rounded outline-none"
                autoFocus
              />
              <button onClick={() => handleSaveTemplate(alert)} className="text-primary text-[10px]">Save</button>
              <button onClick={() => setSavingFrom(null)} className="text-muted-foreground text-[10px]">✕</button>
            </>
          ) : (
            <button
              onClick={() => setSavingFrom(alert.id)}
              className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80"
            >
              <Save size={9} /> Save "{alert.symbol}" alert as template
            </button>
          )}
        </div>
      ))}

      {/* Templates list */}
      {alertTemplates.length > 0 && (
        <>
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-1 mt-2">
            Templates ({alertTemplates.length})
          </div>
          {alertTemplates.map(tpl => (
            <div key={tpl.id} className="panel-section rounded p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">{tpl.name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleApplyTemplate(tpl)}
                    className="text-[10px] text-primary hover:opacity-80"
                    title="Apply to current symbol"
                  >
                    Apply
                  </button>
                  <button onClick={() => removeAlertTemplate(tpl.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={9} />
                  </button>
                </div>
              </div>
              <div className="text-muted-foreground mt-0.5">
                {tpl.conditions.map((c, i) => (
                  <span key={i}>
                    {i > 0 && ' AND '}
                    {c.type.replace('_', ' ')} {c.value}
                  </span>
                ))}
                <span className="ml-1">· {tpl.timeframe}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
