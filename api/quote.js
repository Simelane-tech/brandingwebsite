const {
  ADMIN_EMAIL, FROM_EMAIL,
  applyCors, isRateLimited, getBody, sendMailSafe,
  sanitizeField, isValidEmail,
  quoteAdminHtml, quoteAutoReplyHtml
} = require('./_lib/mail-core');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (isRateLimited(req)) return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });

  try {
    const body = getBody(req);
    let name = sanitizeField(body.name, 150);
    let company = sanitizeField(body.company, 150);
    let email = sanitizeField(body.email, 254);
    let phone = sanitizeField(body.phone, 40);
    let service = sanitizeField(body.service, 150);
    let quantity = sanitizeField(body.quantity, 150);
    let deadline = sanitizeField(body.deadline, 100);
    let budget = sanitizeField(body.budget, 100);
    let details = sanitizeField(body.details, 5000);

    if (!name || !email || !phone || !service || !details) {
      return res.status(400).json({ success: false, message: 'Please fill in Name, Email, Phone, Service, and Description.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Single reference number generated ONCE here and reused for both emails
    // AND returned to the client, so the popup, the on-page display, and the
    // emailed reference are always identical.
    const ref = 'BNT-' + Date.now().toString().slice(-6);

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
      return res.status(500).json({ success: false, message: 'Email failed to send. Please try again or call +268 7632 0436.' });
    }
    res.status(200).json({ success: true, message: 'Quote request submitted! We will reply within 24 hours.', reference: ref });
  } catch (err) {
    console.log('FATAL /api/quote:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again or call +268 7632 0436.' });
  }
};
