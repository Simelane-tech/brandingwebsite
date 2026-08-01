// ============================================
// SHARED LOGIC FOR /api/contact, /api/quote, /api/subscribe
// ============================================
// This file is prefixed with an underscore folder (_lib) so Vercel does NOT
// turn it into a route on its own — only contact.js, quote.js, subscribe.js
// (which import from here) become live endpoints.
//
// This is the serverless (Vercel) counterpart to server/server.js. The two
// are kept in sync by hand since Vercel functions can't run a long-lived
// Express app with app.listen() — each request spins up (or reuses a warm)
// isolated function instance instead. If you deploy the /server Express app
// to a traditional Node host (Render/Railway/etc.) instead of Vercel, that
// file is used and this one is unused, and vice versa.

const nodemailer = require('nodemailer');

// ---- env cleanup -------------------------------------------------
function cleanEnv(val, fallback = '') {
  if (val === undefined || val === null) val = '';
  let r = String(val).trim();
  const reStrip = /^["'](.*)["']$/s;
  if (reStrip.test(r)) r = r.replace(reStrip, '$1');
  return r.trim() || fallback;
}

const SMTP_HOST = cleanEnv(process.env.SMTP_HOST, 'smtp.gmail.com');
const SMTP_PORT_SECURE = 465;
const SMTP_PORT_STARTTLS = 587;
let SMTP_USER = cleanEnv(process.env.SMTP_USER);
const SMTP_PASS = cleanEnv(process.env.SMTP_PASS).replace(/\s+/g, '');
let ADMIN_EMAIL = cleanEnv(process.env.ADMIN_EMAIL, SMTP_USER);
let FROM_EMAIL = cleanEnv(process.env.FROM_EMAIL);
const WEBSITE_URL_OVERRIDE = cleanEnv(process.env.WEBSITE_URL);

if (!ADMIN_EMAIL || ADMIN_EMAIL.indexOf('@') < 0) ADMIN_EMAIL = SMTP_USER;
if (!FROM_EMAIL || FROM_EMAIL.indexOf('@') < 0) FROM_EMAIL = SMTP_USER ? `Bentoks Investments <${SMTP_USER}>` : '';

const missingConfig = [];
if (!SMTP_USER || SMTP_USER.indexOf('@') < 0) missingConfig.push('SMTP_USER');
if (!SMTP_PASS) missingConfig.push('SMTP_PASS');
if (missingConfig.length) {
  // Logs to Vercel's function logs (Project → Deployments → Functions), not to the client.
  console.error(`Missing required SMTP configuration: ${missingConfig.join(', ')}. Set these as Environment Variables in the Vercel project settings.`);
}

// ---- site URL (for links inside emails) ---------------------------
// Derives the real deployed URL from the incoming request (works on any
// Vercel domain/preview URL automatically) unless WEBSITE_URL is explicitly
// set as an env var override.
function getSiteUrl(req) {
  if (WEBSITE_URL_OVERRIDE) return WEBSITE_URL_OVERRIDE.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`;
}

// ---- small security helpers ----------------------------------------
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function sanitizeField(val, maxLen) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen || 500);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// ---- CORS -------------------------------------------------------
// Mirrors server.js: reflect only explicitly allowed origins, never send
// credentials. ALLOWED_ORIGINS is a comma-separated list, or "*" for any
// origin (safe here since credentials are never used).
const allowedOriginsRaw = cleanEnv(process.env.ALLOWED_ORIGINS, '*');
const allowedOrigins = allowedOriginsRaw.split(',').map(s => s.trim()).filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ---- best-effort in-memory rate limiting ---------------------------
// NOTE: Serverless functions are stateless across cold starts and can run
// as multiple parallel instances, so this in-memory limiter only throttles
// requests that land on the SAME warm instance — it is a best-effort
// speed bump against casual spam/abuse, not a hard guarantee like the
// Express version's rate limiter. For strict protection under real load,
// use Vercel's Web Application Firewall/rate limiting, or an edge-based
// store like Upstash Redis (@upstash/ratelimit).
const hits = new Map();
function isRateLimited(req, max = 10, windowMs = 15 * 60 * 1000) {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

// ---- body parsing --------------------------------------------------
// Vercel's Node runtime usually parses JSON bodies into req.body already,
// but this guards against edge cases (empty body, string body).
function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

// ============================================
// SMTP TRANSPORTER (pool persists across warm invocations of the same instance)
// ============================================
let transporter = null;
let lastTransportMode = 'SSL (465)';
function buildTransporter(mode) {
  const isTls587 = mode === 'tls587';
  lastTransportMode = isTls587 ? 'STARTTLS (587)' : 'SSL (465)';
  return nodemailer.createTransport({
    host: SMTP_HOST,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 10,
    port: isTls587 ? SMTP_PORT_STARTTLS : SMTP_PORT_SECURE,
    secure: !isTls587,
    requireTLS: isTls587,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    authMethod: 'LOGIN',
    connectionTimeout: 60 * 1000,
    greetingTimeout: 30 * 1000,
    socketTimeout: 60 * 1000,
    logger: false,
    debug: false,
    tls: { minVersion: 'TLSv1.2' } // cert validation stays ON; no weak-cipher downgrade
  });
}
function getTransporter() {
  if (!transporter) transporter = buildTransporter('ssl465');
  return transporter;
}
function swapTransporter() {
  try { if (transporter && transporter.close) transporter.close(); } catch (e) {}
  const nextMode = lastTransportMode.indexOf('STARTTLS') >= 0 ? 'ssl465' : 'tls587';
  transporter = buildTransporter(nextMode);
  return transporter;
}

async function sendMailSafe(opts, label) {
  const attempts = 2; // kept low: serverless functions have a max execution time (default 10s on Hobby plans)
  for (let i = 1; i <= attempts; i++) {
    try {
      const t = getTransporter();
      const info = await t.sendMail(opts);
      console.log(`[${label}] OK -> ${opts.to}${info.messageId ? ' id ' + info.messageId.slice(0, 25) : ''}`);
      return true;
    } catch (err) {
      const isSocketClose = err.message && (
        err.message.indexOf('Unexpected socket close') >= 0 ||
        err.message.indexOf('socket hang up') >= 0 ||
        err.message.indexOf('read ECONNRESET') >= 0
      );
      const isAuth = err.code === 'EAUTH' || (err.message && err.message.indexOf('Invalid login') >= 0);
      console.log(`[${label}] attempt ${i}/${attempts} failed (${err.code || 'ERR'}): ${(err.message || '').split('\n')[0].slice(0, 140)}`);
      if (isAuth) return false;
      if (isSocketClose) swapTransporter();
      if (i < attempts) await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

// ============================================
// EMAIL TEMPLATES (identical to server/server.js, kept in sync by hand)
// ============================================
function contactAdminHtml(d) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;letter-spacing:.04em;">NEW CONTACT MESSAGE</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <div style="background:#F5F7FA;padding:16px 20px;border-radius:6px;">
        <p style="margin:6px 0;"><strong style="color:#003399;">Full Name:</strong> ${escapeHtml(d.name)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Email:</strong> ${escapeHtml(d.email)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Phone:</strong> ${escapeHtml(d.phone) || 'Not provided'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Service:</strong> ${escapeHtml(d.service) || 'Not specified'}</p>
        <p style="margin:10px 0 6px 0;"><strong style="color:#003399;">Message:</strong><br><span style="white-space:pre-wrap;">${escapeHtml(d.message)}</span></p>
      </div>
    </div>
  </div>`;
}
function contactAutoReplyHtml(name) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;letter-spacing:.04em;">BENTOKS INVESTMENTS</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <h2 style="color:#003399;margin:0 0 12px 0;font-size:20px;">Thank you for contacting us, ${escapeHtml(name)}!</h2>
      <div style="background:#F5F7FA;border-left:4px solid #CC0000;padding:12px 16px;margin:16px 0;"><p style="margin:0;">We received your message and will reply within <strong>24 hours</strong>.</p></div>
      <p>If urgent call us at <strong style="color:#003399;">+268 7632 0436</strong>.</p>
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center;">© Bentoks Investments · Mbabane, Eswatini</p>
    </div>
  </div>`;
}
function quoteAdminHtml(d, ref) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;letter-spacing:.04em;">NEW QUOTE · ${escapeHtml(ref)}</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <div style="background:#F5F7FA;padding:16px 20px;border-radius:6px;margin-bottom:14px;">
        <p style="margin:6px 0;"><strong style="color:#003399;">Name:</strong> ${escapeHtml(d.name)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Company:</strong> ${escapeHtml(d.company) || 'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Email:</strong> ${escapeHtml(d.email)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Phone:</strong> ${escapeHtml(d.phone)}</p>
      </div>
      <div style="background:#F5F7FA;padding:16px 20px;border-radius:6px;">
        <p style="margin:6px 0;"><strong style="color:#003399;">Service:</strong> ${escapeHtml(d.service)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Quantity:</strong> ${escapeHtml(d.quantity) || 'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Deadline:</strong> ${escapeHtml(d.deadline) || 'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Budget:</strong> ${escapeHtml(d.budget) || 'N/A'}</p>
        <p style="margin:10px 0 6px 0;"><strong style="color:#003399;">Description:</strong><br><span style="white-space:pre-wrap;">${escapeHtml(d.details)}</span></p>
      </div>
    </div>
  </div>`;
}
function quoteAutoReplyHtml(name, ref) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;letter-spacing:.04em;">BENTOKS INVESTMENTS</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <p style="text-align:right;margin:0 0 10px 0;"><span style="background:#F5F7FA;border:1px solid #003399;color:#003399;padding:6px 14px;border-radius:4px;font-weight:bold;font-size:13px;">Ref: ${escapeHtml(ref)}</span></p>
      <h2 style="color:#003399;margin:0 0 12px 0;font-size:20px;">Quote request received, ${escapeHtml(name)}!</h2>
      <div style="background:#F5F7FA;border-left:4px solid #CC0000;padding:12px 16px;margin:16px 0;"><p style="margin:0;">We are preparing your detailed proposal — reply within <strong>24 hours</strong>.</p></div>
      <p style="text-align:center;margin-top:28px;padding:14px;background:#F5F7FA;border-radius:6px;">Need help? Call <strong style="color:#003399;">+268 7632 0436</strong></p>
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center;">© Bentoks Investments · Mbabane, Eswatini</p>
    </div>
  </div>`;
}
function newsletterAdminHtml(email) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;">NEW NEWSLETTER SUBSCRIBER</h1></div>
    <div style="background:#fff;padding:28px;border:1px solid #E2E8F0;text-align:center;">
      <div style="background:#F5F7FA;padding:20px;border-radius:6px;">
        <p style="color:#003399;font-weight:bold;font-size:18px;margin:0;">${escapeHtml(email)}</p>
      </div>
    </div>
  </div>`;
}
function newsletterAutoReplyHtml(siteUrl) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;">BENTOKS INVESTMENTS</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <h2 style="color:#003399;margin:0 0 8px 0;font-size:20px;">🎉 Welcome!</h2>
      <p>Thank you for subscribing. You'll receive branding tips, offers, and news.</p>
      <p style="text-align:center;margin:28px 0 0 0;">
        <a href="${escapeHtml(siteUrl)}/quote.html" style="display:inline-block;background:#003399;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px;letter-spacing:.08em;">REQUEST A QUOTE</a>
      </p>
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center;">© Bentoks Investments</p>
    </div>
  </div>`;
}

module.exports = {
  ADMIN_EMAIL, FROM_EMAIL,
  getSiteUrl, escapeHtml, sanitizeField, isValidEmail,
  applyCors, isRateLimited, getBody, sendMailSafe,
  contactAdminHtml, contactAutoReplyHtml,
  quoteAdminHtml, quoteAutoReplyHtml,
  newsletterAdminHtml, newsletterAutoReplyHtml
};
