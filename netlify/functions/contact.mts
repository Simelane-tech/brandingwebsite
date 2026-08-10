import type { Config, Context } from '@netlify/functions';
import {
  getConfig, corsHeaders, jsonResponse, isRateLimited,
  sanitizeField, isValidEmail, sendMailSafe,
  contactAdminHtml, contactAutoReplyHtml
} from './lib/mail-core.mts';

export default async (req: Request, context: Context) => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed.' }, headers);
  if (isRateLimited(req, context)) return jsonResponse(429, { success: false, message: 'Too many requests. Please try again later.' }, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const name = sanitizeField(body.name, 150);
    const email = sanitizeField(body.email, 254);
    const phone = sanitizeField(body.phone, 40);
    const service = sanitizeField(body.service, 150);
    const message = sanitizeField(body.message, 5000);

    if (!name || !email || !message) {
      return jsonResponse(400, { success: false, message: 'Name, Email, and Message are required.' }, headers);
    }
    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, message: 'Please provide a valid email address.' }, headers);
    }

    const { ADMIN_EMAIL, FROM_EMAIL } = getConfig();

    // Sent concurrently so both emails have the best chance of completing
    // before the function's execution time limit.
    const [toAdmin, toClient] = await Promise.all([
      sendMailSafe({
        from: FROM_EMAIL, to: ADMIN_EMAIL, replyTo: email,
        subject: `New Contact Message - ${name}`,
        html: contactAdminHtml({ name, email, phone, service, message })
      }, 'Contact->Admin'),
      sendMailSafe({
        from: FROM_EMAIL, to: email,
        subject: `Thank you for contacting Bentoks Investments`,
        html: contactAutoReplyHtml(name)
      }, 'Contact->Client')
    ]);

    if (!toAdmin || !toClient) {
      return jsonResponse(500, { success: false, message: 'Email failed to send. Please try again or call +268 7632 0436.' }, headers);
    }
    return jsonResponse(200, { success: true, message: 'Message sent! We will reply within 24 hours.' }, headers);
  } catch (err: any) {
    console.log('FATAL /api/contact:', err && err.message);
    return jsonResponse(500, { success: false, message: 'Server error. Please try again or call +268 7632 0436.' }, headers);
  }
};

export const config: Config = {
  path: '/api/contact',
  method: ['POST', 'OPTIONS']
};
