// ============================================
// ENV LOADING (bullet-proof: dotenv + manual parse fallback)
// ============================================
const path = require('path');
const fs = require('fs');

// Try dotenv.config() first — but MANUALLY PARSE .env as ULTIMATE fallback
const envFile = path.join(__dirname, '.env');
const manualEnv = {};
try {
  const raw = fs.readFileSync(envFile, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    let k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    // Strip surrounding single or double quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    manualEnv[k] = v;
    if (!process.env[k]) process.env[k] = v; // fallback populate if dotenv didn't
  });
} catch (e) { /* ignore missing .env */ }

// dotenv.config with override so values in .env ALWAYS win over inherited shell vars
try { require('dotenv').config({ path: envFile, override: true }); } catch(e) {}

// 2nd pass: ensure manual values override everything (fixes dotenv v14+ quirks with FROM_EMAIL="<addr>" etc.)
Object.keys(manualEnv).forEach(k => { process.env[k] = manualEnv[k]; });

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// Trust the first proxy hop (needed on Render/Heroku/Railway/behind Nginx so
// rate-limiting and req.ip see the real client IP instead of the proxy's IP).
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ============================================
// SMALL SECURITY HELPERS
// ============================================
// Escapes user-supplied text before it is interpolated into HTML email
// templates, preventing HTML/script injection into outgoing emails.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Strips characters that could be used for email header injection
// (CRLF injection into "to"/"subject"/etc.) and enforces a max length.
function sanitizeField(val, maxLen) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen || 500);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// ============================================
// ENV VALUE CLEANUP (fixes quotes, spaces, etc.)
// ============================================
function cleanEnv(val, fallback = '') {
  if (val === undefined || val === null) val = '';
  let r = String(val).trim();
  // Strip surrounding quotes
  const reStrip = /^["'](.*)["']$/s;
  if (reStrip.test(r)) r = r.replace(reStrip, '$1');
  return r.trim() || fallback;
}
// Now DEFINE — with debug logging (only once at top) so we NEVER see empty again
const SMTP_HOST = cleanEnv(process.env.SMTP_HOST, 'smtp.gmail.com');
const SMTP_PORT_SECURE = 465;   // SSL
const SMTP_PORT_STARTTLS = 587; // TLS (alternative if 465 socket issues)
let SMTP_USER = cleanEnv(process.env.SMTP_USER);
const SMTP_PASS_RAW = cleanEnv(process.env.SMTP_PASS);
const SMTP_PASS = SMTP_PASS_RAW.replace(/\s+/g, '');
let ADMIN_EMAIL = cleanEnv(process.env.ADMIN_EMAIL, SMTP_USER);
let FROM_EMAIL = cleanEnv(process.env.FROM_EMAIL);
const WEBSITE_URL_OVERRIDE = cleanEnv(process.env.WEBSITE_URL); // optional manual override; leave unset to auto-detect
// Works out the public URL of this site for the current request. If
// WEBSITE_URL is set in .env, that's used as-is (useful for split hosting,
// e.g. a separate static frontend). Otherwise it's derived from the request
// itself (protocol + host), so links in emails (like the "Request a Quote"
// button) always point to wherever the site is actually running — Vercel,
// Render, a custom domain, localhost, whatever — with no manual config
// needed per deployment. Requires `trust proxy` (set above) to correctly
// see https/host through a reverse proxy or platform load balancer.
function getSiteUrl(req) {
  if (WEBSITE_URL_OVERRIDE) return WEBSITE_URL_OVERRIDE.replace(/\/+$/, '');
  const proto = (req && (req.protocol)) || 'https';
  const host = req && req.get ? req.get('host') : null;
  if (!host) return `http://localhost:${PORT}`;
  return `${proto}://${host}`;
}

// NOTE: Previously this fell back to a hardcoded personal Gmail address if env
// vars were missing. That is a security/config bug (secrets & PII must never be
// hardcoded in source) — removed. We now fail loudly instead, so misconfiguration
// is caught immediately rather than silently mailing the wrong inbox.
const missingConfig = [];
if (!SMTP_USER || SMTP_USER.indexOf('@') < 0) missingConfig.push('SMTP_USER');
if (!SMTP_PASS) missingConfig.push('SMTP_PASS');
if (!ADMIN_EMAIL || ADMIN_EMAIL.indexOf('@') < 0) ADMIN_EMAIL = SMTP_USER; // safe derived default only
if (!FROM_EMAIL || FROM_EMAIL.indexOf('@') < 0) FROM_EMAIL = SMTP_USER ? `Bentoks Investments <${SMTP_USER}>` : '';
if (missingConfig.length) {
  console.error(`\n❌ Missing required SMTP configuration: ${missingConfig.join(', ')}`);
  console.error('   Set these in server/.env before starting the server. See .env.example.\n');
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet({
  contentSecurityPolicy: false, // the frontend uses inline styles/scripts; CSP would need a full audit of index.html etc. to enable safely
  crossOriginEmbedderPolicy: false
}));

// CORS: reflect ONLY explicitly allowed origins. Previously this was
// `{ origin: true, credentials: true }`, which reflects *any* requesting
// origin and allows credentials — that combination lets any website make
// authenticated cross-site requests against this API. The frontend never
// sends credentials, so credentials are disabled, and origins are locked
// down via ALLOWED_ORIGINS in .env (comma-separated list, or "*" for local dev).
const allowedOriginsRaw = cleanEnv(process.env.ALLOWED_ORIGINS, '*');
const allowedOrigins = allowedOriginsRaw.split(',').map(s => s.trim()).filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');
app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (curl, server-to-server, health checks) with no Origin header
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS']
}));

// Body size limits: a contact/quote form never needs 10mb. Keeping limits
// small reduces the blast radius of trivial payload-flooding DoS attempts.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ============================================
// STATIC FILE SERVING — deny sensitive paths FIRST
// ============================================
// This server serves the whole site from the project root (parent of
// /server), which is convenient but dangerous: without this guard, requests
// like GET /server/server.js, /server/.env, /server/node_modules/... or
// /.git/... would be served as plain static files, leaking backend source
// code, credentials, and full git history to the public internet.
const BLOCKED_PATH_PREFIXES = ['/server', '/.git', '/node_modules', '/.env'];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED_PATH_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(path.join(__dirname, '..'), { dotfiles: 'deny' }));

// Rate limiting on the mail-sending endpoints only, to prevent the contact
// form being used to spam/flood the SMTP account or as an email relay.
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

// ============================================
// ROBUST SMTP TRANSPORTER (pool + socket settings + auto-fallback)
// ============================================
let transporter = null;
let lastTransportMode = 'SSL (465)';

function buildTransporter(mode) {
  mode = mode || 'ssl465';
  const isTls587 = (mode === 'tls587');
  const cfg = {
    host: SMTP_HOST,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 10,
    port: isTls587 ? SMTP_PORT_STARTTLS : SMTP_PORT_SECURE,
    secure: !isTls587,             // true for 465 (SSL), false for 587 (STARTTLS)
    requireTLS: isTls587,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    authMethod: 'LOGIN',
    connectionTimeout: 2 * 60 * 1000, // 2 min instead of 2 min default (give it time)
    greetingTimeout: 60 * 1000,
    socketTimeout: 5 * 60 * 1000,   // 5 minutes to avoid premature socket close
    logger: false,
    debug: false,
    tls: {
      // rejectUnauthorized was previously `false` (disables SMTP TLS certificate
      // validation — a MITM vulnerability) and ciphers was downgraded to
      // SECLEVEL=1 (permits legacy/weak ciphers). Both removed; use secure
      // Node/OpenSSL defaults with a modern minimum TLS version.
      minVersion: 'TLSv1.2'
    }
  };
  lastTransportMode = isTls587 ? 'STARTTLS (587)' : 'SSL (465)';
  console.log(`   🔌 Creating transporter: ${lastTransportMode}`);
  return nodemailer.createTransport(cfg);
}

function getTransporter() {
  if (!transporter) transporter = buildTransporter('ssl465');
  return transporter;
}

// For socket close errors: swap to TLS 587
function swapTransporter() {
  try { if (transporter && transporter.close) transporter.close(); } catch (e) {}
  const nextMode = (lastTransportMode.indexOf('STARTTLS') >= 0) ? 'ssl465' : 'tls587';
  console.log(`   🔁 Socket close detected. Swapping to: ${nextMode === 'tls587' ? 'STARTTLS (587)' : 'SSL (465)'}`);
  transporter = buildTransporter(nextMode);
  return transporter;
}

// ============================================
// HELPER: Send email SAFELY with RETRY logic + socket-fail swap
// ============================================
async function sendMailSafe(opts, label) {
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      const t = getTransporter();
      const info = await t.sendMail(opts);
      console.log(`   ✅ [${label}] OK → ${opts.to}${info.messageId ? ' · ID ' + info.messageId.slice(0,25)+'...' : ''}`);
      return true;
    } catch (err) {
      const isSocketClose = err.message && (
        err.message.indexOf('Unexpected socket close') >= 0 ||
        err.message.indexOf('socket hang up') >= 0 ||
        err.message.indexOf('read ECONNRESET') >= 0 ||
        err.message.indexOf('ECONNECTION') >= 0 ||
        (err.code && ['ESOCKET', 'ECONNRESET', 'ETIMEDOUT', 'ECONNECTION', 'EPIPE'].indexOf(err.code) >= 0)
      );
      const isAuth = err.code === 'EAUTH' || (err.message && err.message.indexOf('Invalid login') >= 0);
      console.log(`   ⚠️  [${label}] Attempt ${i}/${attempts} FAILED (${err.code||'ERR'}): ${err.message.split('\n')[0].slice(0,140)}`);
      if (isAuth) return false; // no point retrying auth
      if (isSocketClose) swapTransporter();   // switch SSL ↔ TLS
      if (i < attempts) {
        const ms = 800 * i;
        await new Promise(r => setTimeout(r, ms));
      } else {
        return false;
      }
    }
  }
  return false;
}

// ============================================
// EMAIL TEMPLATES (clean, minimal, always render)
// ============================================
function contactAdminHtml(d) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;line-height:1.6;color:#1A202C;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;letter-spacing:.04em;">NEW CONTACT MESSAGE</h1></div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #E2E8F0;">
      <div style="background:#F5F7FA;padding:16px 20px;border-radius:6px;">
        <p style="margin:6px 0;"><strong style="color:#003399;">Full Name:</strong> ${escapeHtml(d.name)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Email:</strong> ${escapeHtml(d.email)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Phone:</strong> ${escapeHtml(d.phone)||'Not provided'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Service:</strong> ${escapeHtml(d.service)||'Not specified'}</p>
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
        <p style="margin:6px 0;"><strong style="color:#003399;">Company:</strong> ${escapeHtml(d.company)||'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Email:</strong> ${escapeHtml(d.email)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Phone:</strong> ${escapeHtml(d.phone)}</p>
      </div>
      <div style="background:#F5F7FA;padding:16px 20px;border-radius:6px;">
        <p style="margin:6px 0;"><strong style="color:#003399;">Service:</strong> ${escapeHtml(d.service)}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Quantity:</strong> ${escapeHtml(d.quantity)||'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Deadline:</strong> ${escapeHtml(d.deadline)||'N/A'}</p>
        <p style="margin:6px 0;"><strong style="color:#003399;">Budget:</strong> ${escapeHtml(d.budget)||'N/A'}</p>
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

// ============================================
// ROUTES
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Bentoks Investments Email API', mode: lastTransportMode, timestamp: new Date().toISOString() });
});

app.post('/api/contact', formLimiter, async (req, res) => {
  console.log('\n📨 POST /api/contact');
  try {
    let { name, email, phone, service, message } = req.body || {};
    name = sanitizeField(name, 150);
    email = sanitizeField(email, 254);
    phone = sanitizeField(phone, 40);
    service = sanitizeField(service, 150);
    message = sanitizeField(message, 5000);
    if (!name || !email || !message) {
      console.log('   ❌ 400: Missing fields. name=' + !!name + ' email=' + !!email + ' msg=' + !!message);
      return res.status(400).json({ success: false, message: 'Name, Email, and Message are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }
    const toAdmin = await sendMailSafe({
      from: FROM_EMAIL, to: ADMIN_EMAIL, replyTo: email,
      subject: `New Contact Message - ${name}`,
      html: contactAdminHtml({ name, email, phone, service, message })
    }, 'Contact→Admin');
    const toClient = await sendMailSafe({
      from: FROM_EMAIL, to: email,
      subject: `Thank you for contacting Bentoks Investments`,
      html: contactAutoReplyHtml(name)
    }, 'Contact→Client');
    if (!toAdmin || !toClient) {
      return res.status(500).json({ success: false, message: `Email failed to send. Please try again or call +268 7632 0436.` });
    }
    res.json({ success: true, message: 'Message sent! We will reply within 24 hours.' });
  } catch (err) {
    console.log('   ❌ FATAL:', err.code, err.message);
    res.status(500).json({ success: false, message: `Server error. Please try again or call +268 7632 0436.` });
  }
});

app.post('/api/quote', formLimiter, async (req, res) => {
  console.log('\n💰 POST /api/quote');
  try {
    let { name, company, email, phone, service, quantity, deadline, budget, details } = req.body || {};
    name = sanitizeField(name, 150);
    company = sanitizeField(company, 150);
    email = sanitizeField(email, 254);
    phone = sanitizeField(phone, 40);
    service = sanitizeField(service, 150);
    quantity = sanitizeField(quantity, 150);
    deadline = sanitizeField(deadline, 100);
    budget = sanitizeField(budget, 100);
    details = sanitizeField(details, 5000);
    if (!name || !email || !phone || !service || !details) {
      console.log('   ❌ 400: Missing required fields');
      return res.status(400).json({ success: false, message: 'Please fill in Name, Email, Phone, Service, and Description.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }
    const ref = 'BNT-' + Date.now().toString().slice(-6);
    const toAdmin = await sendMailSafe({
      from: FROM_EMAIL, to: ADMIN_EMAIL, replyTo: email,
      subject: `New Quote [${ref}] - ${name}`,
      html: quoteAdminHtml({ name, company, email, phone, service, quantity, deadline, budget, details }, ref)
    }, 'Quote→Admin');
    const toClient = await sendMailSafe({
      from: FROM_EMAIL, to: email,
      subject: `Quote Received - Ref ${ref}`,
      html: quoteAutoReplyHtml(name, ref)
    }, 'Quote→Client');
    if (!toAdmin || !toClient) {
      return res.status(500).json({ success: false, message: `Email failed to send. Please try again or call +268 7632 0436.` });
    }
    res.json({ success: true, message: 'Quote request submitted! We will reply within 24 hours.', reference: ref });
  } catch (err) {
    console.log('   ❌ FATAL:', err.code, err.message);
    res.status(500).json({ success: false, message: `Server error. Please try again or call +268 7632 0436.` });
  }
});

app.post('/api/subscribe', formLimiter, async (req, res) => {
  console.log('\n📬 POST /api/subscribe');
  try {
    let { email } = req.body || {};
    email = sanitizeField(email, 254);
    if (!email || !isValidEmail(email)) {
      console.log('   ❌ 400: Invalid/missing email =', email);
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }
    const toAdmin = await sendMailSafe({
      from: FROM_EMAIL, to: ADMIN_EMAIL,
      subject: `New Subscriber: ${email}`,
      html: newsletterAdminHtml(email)
    }, 'News→Admin');
    const toClient = await sendMailSafe({
      from: FROM_EMAIL, to: email,
      subject: `Welcome to Bentoks Newsletter!`,
      html: newsletterAutoReplyHtml(getSiteUrl(req))
    }, 'News→Client');
    if (!toAdmin || !toClient) {
      return res.status(500).json({ success: false, message: `Subscription could not be processed. Please try again or email ${ADMIN_EMAIL}.` });
    }
    res.json({ success: true, message: 'Subscribed! Thank you for joining our newsletter.' });
  } catch (err) {
    console.log('   ❌ FATAL:', err.code, err.message);
    res.status(500).json({ success: false, message: `Server error. Please try again.` });
  }
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
// Catches malformed JSON bodies (express.json() throws a SyntaxError) and any
// other uncaught errors, returning clean JSON instead of Express's default
// HTML error page (which can leak stack traces when NODE_ENV isn't 'production').
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request too large.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid request body.' });
  }
  console.log('   ❌ UNHANDLED ERROR:', err && err.message);
  res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
});

// 404 for anything else under /api
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found.' }));

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(68));
  console.log('  🟢 BENTOKS INVESTMENTS EMAIL API — RUNNING');
  console.log('  📡 Port    : ' + PORT);
  console.log('  🌐 Website : http://localhost:' + PORT + '/index.html');
  console.log('  💓 Health  : http://localhost:' + PORT + '/api/health');
  console.log('  🔌 SMTP    : ' + SMTP_USER + ' (' + lastTransportMode + ')');
  console.log('  📥 Admin → : ' + ADMIN_EMAIL);
  console.log('═'.repeat(68) + '\n');
  if (!SMTP_PASS || SMTP_PASS === 'your_gmail_app_password_here') {
    console.log('  ⚠️  SMTP_PASS not configured — create at https://myaccount.google.com/apppasswords\n');
  }
});
server.on('error', (err) => {
  console.error('\n❌ SERVER ERROR:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.log(`   Port ${PORT} is in use.`);
    console.log(`   • Change PORT in server/.env or kill old process on port ${PORT}`);
    console.log(`   • In PowerShell: netstat -ano | findstr :${PORT} ; then taskkill /PID <pid> /F`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => { try { if(transporter && transporter.close) transporter.close(); } catch(e){} server.close(()=>process.exit(0)); });
process.on('SIGINT',  () => { try { if(transporter && transporter.close) transporter.close(); } catch(e){} server.close(()=>process.exit(0)); });
