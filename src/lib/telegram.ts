/**
 * Telegram Bot API helpers.
 * Wire-up:
 *   1. Set TELEGRAM_BOT_TOKEN (from @BotFather).
 *   2. Set TELEGRAM_WEBHOOK_URL to this app's public HTTPS origin.
 *   3. Set TELEGRAM_WEBHOOK_SECRET to a random string (used as part of the webhook path).
 *   4. Call: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<TELEGRAM_WEBHOOK_URL>/api/integrations/telegram/<TELEGRAM_WEBHOOK_SECRET>
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

const API = 'https://api.telegram.org';

function token(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const t = token();
  if (!t) return;
  try {
    await fetch(`${API}/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch {
    // Swallow network errors – the webhook should still ack 200 to Telegram.
  }
}

export async function getMe(): Promise<unknown> {
  const t = token();
  if (!t) return null;
  const res = await fetch(`${API}/bot${t}/getMe`);
  return res.json();
}
