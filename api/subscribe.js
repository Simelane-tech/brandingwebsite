const {
  ADMIN_EMAIL, FROM_EMAIL,
  applyCors, isRateLimited, getBody, sendMailSafe,
  sanitizeField, isValidEmail, getSiteUrl,
  newsletterAdminHtml, newsletterAutoReplyHtml
} = require('./_lib/mail-core');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (isRateLimited(req)) return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });

  try {
    const body = getBody(req);
    let email = sanitizeField(body.email, 254);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const [toAdmin, toClient] = await Promise.all([
      sendMailSafe({
        from: FROM_EMAIL, to: ADMIN_EMAIL,
        subject: `New Subscriber: ${email}`,
        html: newsletterAdminHtml(email)
      }, 'News->Admin'),
      // The "Request a Quote" button inside this email is built from the real
      // request host (getSiteUrl), so it always points to wherever this site
      // is actually deployed — the Vercel production domain, a preview URL,
      // or a custom domain — never a stale/hardcoded address.
      sendMailSafe({
        from: FROM_EMAIL, to: email,
        subject: `Welcome to Bentoks Newsletter!`,
        html: newsletterAutoReplyHtml(getSiteUrl(req))
      }, 'News->Client')
    ]);

    if (!toAdmin || !toClient) {
      return res.status(500).json({ success: false, message: `Subscription could not be processed. Please try again or email ${ADMIN_EMAIL}.` });
    }
    res.status(200).json({ success: true, message: 'Subscribed! Thank you for joining our newsletter.' });
  } catch (err) {
    console.log('FATAL /api/subscribe:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};
