// Outbound email. Postmark when POSTMARK_TOKEN is set (PLAN.md 8), otherwise
// messages go to the server log, which is enough for local development.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
  }
}

/** Keeps messages in memory. For tests. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
}

export class PostmarkMailer implements Mailer {
  constructor(
    private token: string,
    private from: string,
  ) {}

  async send(mail: Mail) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "x-postmark-server-token": this.token },
      body: JSON.stringify({ From: this.from, To: mail.to, Subject: mail.subject, TextBody: mail.text, MessageStream: "outbound" }),
    });
    if (!res.ok) throw new Error(`Postmark refused the message (${res.status})`);
  }
}

export function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer {
  if (env.POSTMARK_TOKEN && env.MAIL_FROM) return new PostmarkMailer(env.POSTMARK_TOKEN, env.MAIL_FROM);
  return new ConsoleMailer();
}
