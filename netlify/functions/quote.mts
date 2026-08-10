import type { Config, Context } from '@netlify/functions';
import {
  getConfig, corsHeaders, jsonResponse, isRateLimited,
  sanitizeField, isValidEmail, sendMailSafe,
  quoteAdminHtml, quoteAutoReplyHtml
} from './lib/mail-core.mts';

export default async (req: Request, context: Context) => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed.' }, headers);
  if (isRateLimited(req, context)) return jsonResponse(429, { success: false, message: 'Too many requests. Please try again later.' }, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const name = sanitizeField(body.name, 150);
    const company = sanitizeField(body.company, 150);
    const email = sanitizeField(body.email, 254);
    const phone = sanitizeField(body.phone, 40);
    const service = sanitizeField(body.service, 150);
    const quantity = sanitizeField(body.quantity, 150);
    const deadline = sanitizeField(body.deadline, 100);
    const budget = sanitizeField(body.budget, 100);
    const details = sanitizeField(body.details, 5000);

    if (!name || !email || !phone || !service || !details) {
      return jsonResponse(400, { success: false, message: 'Please fill in Name, Email, Phone, Service, and Description.' }, headers);
    }
    if (!isValidEmail(email)) {
      return jsonResponse(400, { success: false, message: 'Please provide a valid email address.' }, headers);
    }

    // Single reference number generated ONCE here and reused for both emails
    // AND returned to the client, so the popup, the on-page display, and the
    // emailed reference are always identical.
    const ref = 'BNT-' + Date.now().toString().slice(-6);

    const { ADMIN_EMAIL, FROM_EMAIL } = getConfig();

    const [toAdmin, toClient] = await Promise.all([
      sendMailSafe({
        from: FROM_EMAIL, to: ADMIN_EMAIL, replyTo: email,
        subject: `New Quote [${ref}] - ${name}`,
        html: quoteAdminHtml({ name, company, email, phone, service, quantity, deadline, budget, details }, ref)
      }, 'Quote->Admin'),
      sendMailSafe({
        from: FROM_EMAIL, to: email,
        subject: `Quote Received - Ref ${ref}`,
        html: quoteAutoReplyHtml(name, ref)
      }, 'Quote->Client')
    ]);

    if (!toAdmin || !toClient) {
      return jsonResponse(500, { success: false, message: 'Email failed to send. Please try again or call +268 7632 0436.' }, headers);
    }
    return jsonResponse(200, { success: true, message: 'Quote request submitted! We will reply within 24 hours.', reference: ref }, headers);
  } catch (err: any) {
    console.log('FATAL /api/quote:', err && err.message);
    return jsonResponse(500, { success: false, message: 'Server error. Please try again or call +268 7632 0436.' }, headers);
  }
};

export const config: Config = {
  path: '/api/quote',
  method: ['POST', 'OPTIONS']
};
