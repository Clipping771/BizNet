export interface SmsProvider {
  sendSms(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export class ConsoleSmsProvider implements SmsProvider {
  async sendSms(to: string, message: string) {
    console.log(`[SMS Console] To: ${to} | Message: ${message}`);
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}

export class HttpSmsProvider implements SmsProvider {
  private url: string;
  private apiKey: string;
  private senderId?: string;

  constructor(url: string, apiKey: string, senderId?: string) {
    this.url = url;
    this.apiKey = apiKey;
    this.senderId = senderId;
  }

  async sendSms(to: string, message: string) {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          to,
          message,
          sender_id: this.senderId,
        }),
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { success: true, messageId: data.message_id || data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export function getSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER || "console";
  if (provider === "http" && process.env.SMS_HTTP_URL && process.env.SMS_API_KEY) {
    return new HttpSmsProvider(
      process.env.SMS_HTTP_URL,
      process.env.SMS_API_KEY,
      process.env.SMS_SENDER_ID
    );
  }
  return new ConsoleSmsProvider();
}
