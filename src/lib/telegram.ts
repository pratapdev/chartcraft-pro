const STORAGE_KEY = 'telegram-credentials';

interface TelegramCredentials {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export function getTelegramCredentials(): TelegramCredentials {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { botToken: '', chatId: '', enabled: false };
}

export function saveTelegramCredentials(creds: TelegramCredentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export async function sendTelegramMessage(message: string): Promise<boolean> {
  const { botToken, chatId, enabled } = getTelegramCredentials();
  if (!enabled || !botToken || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function testTelegramNotification(): Promise<boolean> {
  return sendTelegramMessage('✅ <b>Test Alert</b>\nTelegram notifications are working!');
}
