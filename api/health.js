const { getEmailStatus } = require('./_lib/mail-core');

module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed.' });
  }
  const email = getEmailStatus();
  return res.status(email.configured ? 200 : 503).json({
    status: email.configured ? 'ok' : 'degraded',
    service: 'Website Email API',
    email: {
      configured: email.configured,
      smtpUserPresent: email.smtpUserPresent,
      smtpPasswordPresent: email.smtpPasswordPresent,
      adminEmailPresent: email.adminEmailPresent
    },
    timestamp: new Date().toISOString()
  });
};
