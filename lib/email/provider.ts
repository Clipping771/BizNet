export interface EmailProvider {
  sendEmail(
    to: string,
    subject: string,
    bodyText: string,
    bodyHtml?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, bodyText: string) {
    console.log(`[Email Console] To: ${to} | Subject: ${subject} | Body: ${bodyText}`);
    return { success: true, messageId: `mock-email-${Date.now()}` };
  }
}

export class HttpEmailProvider implements EmailProvider {
  private url: string;
  private apiKey: string;
  private from: string;

  constructor(url: string, apiKey: string, from: string = "auth@biznet.global") {
    this.url = url;
    this.apiKey = apiKey;
    this.from = from;
  }

  async sendEmail(to: string, subject: string, bodyText: string, bodyHtml?: string) {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [to],
          subject,
          text: bodyText,
          html: bodyHtml || bodyText,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[Email Provider Error] HTTP ${res.status}:`, errBody);
        return { success: false, error: `HTTP ${res.status}: ${errBody}` };
      }
      const data = await res.json();
      return { success: true, messageId: data.id || data.message_id };
    } catch (err: any) {
      console.error("[Email Provider Error] Exception:", err);
      return { success: false, error: err.message };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER || "console";
  if (provider === "http" && process.env.EMAIL_HTTP_URL && process.env.EMAIL_API_KEY) {
    return new HttpEmailProvider(
      process.env.EMAIL_HTTP_URL,
      process.env.EMAIL_API_KEY,
      process.env.EMAIL_FROM || "BizNet <onboarding@resend.dev>"
    );
  }
  return new ConsoleEmailProvider();
}
