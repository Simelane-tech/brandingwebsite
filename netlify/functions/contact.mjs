import {
  ADMIN_EMAIL, FROM_EMAIL,
  corsHeaders, jsonResponse, isRateLimited, getBody, sendMailSafe,
  sanitizeField, isValidEmail,
  contactAdminHtml, contactAutoReplyHtml
} from './_lib/mail-core.mjs';

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonResponse(req, 405, { success: false, message: 'Method not allowed.' });
  if (isRateLimited(req, context)) return jsonResponse(req, 429, { success: false, message: 'Too many requests. Please try again later.' });

  try {
    const body = await getBody(req);
    let name = sanitizeField(body.name, 150);
    let email = sanitizeField(body.email, 254);
    let phone = sanitizeField(body.phone, 40);
    let service = sanitizeField(body.service, 150);
    let message = sanitizeField(body.message, 5000);

    if (!name || !email || !message) {
      return jsonResponse(req, 400, { success: false, message: 'Name, Email, and Message are required.' });
    }
    if (!isValidEmail(email)) {
      return jsonResponse(req, 400, { success: false, message: 'Please provide a valid email address.' });
    }

    // Sent concurrently (not one-after-another) so both emails have the best
    // chance of completing before the function's execution time limit.
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
      return jsonResponse(req, 500, { success: false, message: 'Email failed to send. Please try again or call +268 7632 0436.' });
    }
    return jsonResponse(req, 200, { success: true, message: 'Message sent! We will reply within 24 hours.' });
  } catch (err) {
    console.log('FATAL /api/contact:', err && err.message);
    return jsonResponse(req, 500, { success: false, message: 'Server error. Please try again or call +268 7632 0436.' });
  }
};

export const config = {
  path: '/api/contact'
};
