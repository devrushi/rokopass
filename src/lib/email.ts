export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * No real email provider is wired up yet (no SMTP/SendGrid/Resend account configured for this
 * project). This logs the message instead of silently dropping it, and is the single seam to
 * swap in a real provider later — every caller goes through this function, not a provider SDK
 * directly, so that's a one-file change when the time comes.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  console.log(`[email] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
}
