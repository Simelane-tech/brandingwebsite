import type { Config, Context } from '@netlify/functions';
import {
  getConfig, getSiteUrl, corsHeaders, jsonResponse, isRateLimited,
  sanitizeField, isValidEmail, sendMailSafe,
  newsletterAdminHtml, newsletterAutoReplyHtml
} from './lib/mail-core.mts';

export default async (req: Request, context: Context) => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return jsonResponse(405, { success: false, message: 'Method not allowed.' }, headers);
  if (isRateLimited(req, context)) return jsonResponse(429, { success: false, message: 'Too many requests. Please try again later.' }, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const email = sanitizeField(body.email, 254);

    if (!email || !isValidEmail(email)) {
      return jsonResponse(400, { success: false, message: 'Valid email address is required.' }, headers);
    }

    const { ADMIN_EMAIL, FROM_EMAIL } = getConfig();

    const [toAdmin, toClient] = await Promise.all([
      sendMailSafe({
        from: FROM_EMAIL, to: ADMIN_EMAIL,
        subject: `New Subscriber: ${email}`,
        html: newsletterAdminHtml(email)
      }, 'News->Admin'),
      // The "Request a Quote" button inside this email is built from the real
      // request origin (getSiteUrl), so it always points to wherever this
      // site is actually deployed — production, a deploy preview, or a
      // custom domain — never a stale/hardcoded address.
      sendMailSafe({
        from: FROM_EMAIL, to: email,
        subject: `Welcome to Bentoks Newsletter!`,
        html: newsletterAutoReplyHtml(getSiteUrl(req))
      }, 'News->Client')
    ]);

    if (!toAdmin || !toClient) {
      return jsonResponse(500, { success: false, message: `Subscription could not be processed. Please try again or email ${ADMIN_EMAIL}.` }, headers);
    }
    return jsonResponse(200, { success: true, message: 'Subscribed! Thank you for joining our newsletter.' }, headers);
  } catch (err: any) {
    console.log('FATAL /api/subscribe:', err && err.message);
    return jsonResponse(500, { success: false, message: 'Server error. Please try again.' }, headers);
  }
};

export const config: Config = {
  path: '/api/subscribe',
  method: ['POST', 'OPTIONS']
};
