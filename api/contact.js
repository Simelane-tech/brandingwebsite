const {
  ADMIN_EMAIL, FROM_EMAIL,
  applyCors, isRateLimited, getBody, sendMailSafe,
  sanitizeField, isValidEmail,
  contactAdminHtml, contactAutoReplyHtml
} = require('./_lib/mail-core');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });
  if (isRateLimited(req)) return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });

  try {
    const body = getBody(req);
    let name = sanitizeField(body.name, 150);
    let email = sanitizeField(body.email, 254);
    let phone = sanitizeField(body.phone, 40);
    let service = sanitizeField(body.service, 150);
    let message = sanitizeField(body.message, 5000);

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, Email, and Message are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Sent concurrently (not one-after-another) so both emails have the best
    // chance of completing before Vercel's function execution time limit
    // (10s on the Hobby plan) — waiting for the admin email to fully finish
    // before even starting the client email risked timing out mid-way.
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
      return res.status(500).json({ success: false, message: 'Email failed to send. Please try again or call +268 7632 0436.' });
    }
    res.status(200).json({ success: true, message: 'Message sent! We will reply within 24 hours.' });
  } catch (err) {
    console.log('FATAL /api/contact:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again or call +268 7632 0436.' });
  }
};
