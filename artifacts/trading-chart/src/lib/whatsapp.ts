const STORAGE_KEY = 'whatsapp-credentials';

export type WhatsAppProvider = 'callmebot' | 'greenapi' | 'whin' | 'ntfy';

interface WhatsAppCredentials {
  provider: WhatsAppProvider;
  phoneNumber: string; // for callmebot, whin, greenapi (chatId)
  apiKey: string;      // for callmebot, whin
  greenApiIdInstance?: string;
  greenApiTokenInstance?: string;
  ntfyTopic?: string;
  enabled: boolean;
}

export function getWhatsAppCredentials(): WhatsAppCredentials {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { 
    provider: 'callmebot',
    phoneNumber: '', 
    apiKey: '', 
    enabled: false 
  };
}

export function saveWhatsAppCredentials(creds: WhatsAppCredentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export async function sendWhatsAppMessage(message: string): Promise<boolean> {
  const creds = getWhatsAppCredentials();
  if (!creds.enabled) return false;

  try {
    switch (creds.provider) {
      case 'callmebot': {
        if (!creds.phoneNumber || !creds.apiKey) return false;
        const res = await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(creds.phoneNumber)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(creds.apiKey)}`);
        return res.ok;
      }
      
      case 'greenapi': {
        if (!creds.greenApiIdInstance || !creds.greenApiTokenInstance || !creds.phoneNumber) return false;
        // chatId for individual: [phone]@c.us
        const chatId = creds.phoneNumber.includes('@') ? creds.phoneNumber : `${creds.phoneNumber.replace('+', '')}@c.us`;
        const res = await fetch(`https://api.green-api.com/waInstance${creds.greenApiIdInstance}/sendMessage/${creds.greenApiTokenInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message }),
        });
        return res.ok;
      }

      case 'whin': {
        if (!creds.apiKey) return false;
        // Note: This usually requires RapidAPI header or Whin direct API
        // This is a placeholder for Whin direct API if available
        const res = await fetch(`https://whin2.p.rapidapi.com/send`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': creds.apiKey,
            'X-RapidAPI-Host': 'whin2.p.rapidapi.com'
          },
          body: JSON.stringify({ text: message }),
        });
        return res.ok;
      }

      case 'ntfy': {
        if (!creds.ntfyTopic) return false;
        const res = await fetch(`https://ntfy.sh/${creds.ntfyTopic}`, {
          method: 'POST',
          body: message,
        });
        return res.ok;
      }

      default:
        return false;
    }
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err);
    return false;
  }
}

export async function testWhatsAppNotification(): Promise<boolean> {
  const creds = getWhatsAppCredentials();
  let testMsg = '✅ *Test Alert*\nYour notification system is working!';
  if (creds.provider === 'ntfy') testMsg = '✅ Test Alert: Your notification system is working!';
  
  return sendWhatsAppMessage(testMsg);
}
