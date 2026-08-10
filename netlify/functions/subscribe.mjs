import {
  ADMIN_EMAIL, FROM_EMAIL,
  corsHeaders, jsonResponse, isRateLimited, getBody, sendMailSafe,
  sanitizeField, isValidEmail, getSiteUrl,
  newsletterAdminHtml, newsletterAutoReplyHtml
} from './_lib/mail-core.mjs';

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonResponse(req, 405, { success: false, message: 'Method not allowed.' });
  if (isRateLimited(req, context)) return jsonResponse(req, 429, { success: false, message: 'Too many requests. Please try again later.' });

  try {
    const body = await getBody(req);
    let email = sanitizeField(body.email, 254);

    if (!email || !isValidEmail(email)) {
      return jsonResponse(req, 400, { success: false, message: 'Valid email address is required.' });
    }

    const [toAdmin, toClient] = await Promise.all([
      sendMailSafe({
        from: FROM_EMAIL, to: ADMIN_EMAIL,
        subject: `New Subscriber: ${email}`,
        html: newsletterAdminHtml(email)
      }, 'News->Admin'),
      // The "Request a Quote" button inside this email is built from the real
      // request host (getSiteUrl), so it always points to wherever this site
      // is actually deployed.
      sendMailSafe({
        from: FROM_EMAIL, to: email,
        subject: `Welcome to Bentoks Newsletter!`,
        html: newsletterAutoReplyHtml(getSiteUrl(req))
      }, 'News->Client')
    ]);

    if (!toAdmin || !toClient) {
      return jsonResponse(req, 500, { success: false, message: `Subscription could not be processed. Please try again or email ${ADMIN_EMAIL}.` });
    }
    return jsonResponse(req, 200, { success: true, message: 'Subscribed! Thank you for joining our newsletter.' });
  } catch (err) {
    console.log('FATAL /api/subscribe:', err && err.message);
    return jsonResponse(req, 500, { success: false, message: 'Server error. Please try again.' });
  }
};

export const config = {
  path: '/api/subscribe'
};
