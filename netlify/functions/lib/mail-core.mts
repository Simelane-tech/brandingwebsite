// ============================================
// SHARED LOGIC FOR the contact, quote, and subscribe Netlify Functions
// ============================================
// This file lives in a subfolder of netlify/functions/ that doesn't match a
// function entrypoint pattern (netlify/functions/lib/mail-core.mts is not
// lib.mts or lib/lib.mts), so Netlify treats it as a plain importable module
// rather than a deployable function.

import nodemailer from 'nodemailer';

// ---- env cleanup -------------------------------------------------
function cleanEnv(val: string | undefined, fallback = ''): string {
  if (val === undefined || val === null) val = '';
  let r = String(val).trim();
  const reStrip = /^["'](.*)["']$/s;
  if (reStrip.test(r)) r = r.replace(reStrip, '$1');
  return r.trim() || fallback;
}

// Config is read lazily (not at module load) so it always sees the env vars
// for the current invocation rather than whatever was present at cold start.
let cachedConfig: ReturnType<typeof buildConfig> | null = null;
function buildConfig() {
  const SMTP_HOST = cleanEnv(Netlify.env.get('SMTP_HOST'), 'smtp.gmail.com');
  let SMTP_USER = cleanEnv(Netlify.env.get('SMTP_USER'));
  const SMTP_PASS = cleanEnv(Netlify.env.get('SMTP_PASS')).replace(/\s+/g, '');
  let ADMIN_EMAIL = cleanEnv(Netlify.env.get('ADMIN_EMAIL'), SMTP_USER);
  let FROM_EMAIL = cleanEnv(Netlify.env.get('FROM_EMAIL'));
  const WEBSITE_URL_OVERRIDE = cleanEnv(Netlify.env.get('WEBSITE_URL'));

  if (!ADMIN_EMAIL || ADMIN_EMAIL.indexOf('@') < 0) ADMIN_EMAIL = SMTP_USER;
  if (!FROM_EMAIL || FROM_EMAIL.indexOf('@') < 0) FROM_EMAIL = SMTP_USER ? `Bentoks Investments <${SMTP_USER}>` : '';

  const missingConfig: string[] = [];
  if (!SMTP_USER || SMTP_USER.indexOf('@') < 0) missingConfig.push('SMTP_USER');
  if (!SMTP_PASS) missingConfig.push('SMTP_PASS');
  if (missingConfig.length) {
    // Logs to the function's logs (Netlify UI -> Project -> Logs -> Functions), not to the client.
    console.error(`Missing required SMTP configuration: ${missingConfig.join(', ')}. Set these as Environment Variables in Site configuration -> Environment variables on Netlify.`);
  }

  const allowedOriginsRaw = cleanEnv(Netlify.env.get('ALLOWED_ORIGINS'), '*');
  const allowedOrigins = allowedOriginsRaw.split(',').map(s => s.trim()).filter(Boolean);

  return {
    SMTP_HOST, SMTP_USER, SMTP_PASS, ADMIN_EMAIL, FROM_EMAIL, WEBSITE_URL_OVERRIDE,
    allowedOrigins, allowAllOrigins: allowedOrigins.includes('*'),
    isConfigured: !missingConfig.length
  };
}
export function getConfig() {
  if (!cachedConfig) cachedConfig = buildConfig();
  return cachedConfig;
}

// ---- site URL (for links inside emails) ---------------------------
// Derives the real deployed URL from the incoming request (works on any
// Netlify domain/deploy-preview URL automatically) unless WEBSITE_URL is
// explicitly set as an env var override.
export function getSiteUrl(req: Request): string {
  const { WEBSITE_URL_OVERRIDE } = getConfig();
  if (WEBSITE_URL_OVERRIDE) return WEBSITE_URL_OVERRIDE.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

// ---- small security helpers ----------------------------------------
function escapeHtml(str: unknown): string {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function sanitizeField(val: unknown, maxLen?: number): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen || 500);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: unknown): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// ---- CORS + JSON response helpers -----------------------------------
// Reflects only explicitly allowed origins, never sends credentials.
// ALLOWED_ORIGINS is a comma-separated env var, or "*" for any origin (safe
// here since credentials are never used).
export function corsHeaders(req: Request): Record<string, string> {
  const { allowedOrigins, allowAllOrigins } = getConfig();
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin || '*';
  }
  return headers;
}
export function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

// ---- best-effort in-memory rate limiting ---------------------------
// NOTE: Serverless functions can run as multiple parallel/cold instances, so
// this only throttles requests landing on the SAME warm instance — a
// best-effort speed bump against casual spam, not a hard guarantee.
const hits = new Map<string, { start: number; count: number }>();
export function isRateLimited(req: Request, context: { ip?: string }, max = 10, windowMs = 15 * 60 * 1000): boolean {
  const ip = context.ip || (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

// ============================================
// SMTP TRANSPORTER (persists across warm invocations of the same instance)
// ============================================
let transporter: nodemailer.Transporter | null = null;
let lastTransportMode = 'SSL (465)';
function buildTransporter(mode: 'ssl465' | 'tls587') {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = getConfig();
  const isTls587 = mode === 'tls587';
  lastTransportMode = isTls587 ? 'STARTTLS (587)' : 'SSL (465)';
  return nodemailer.createTransport({
    host: SMTP_HOST,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 10,
    port: isTls587 ? 587 : 465,
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
  try { if (transporter && transporter.close) transporter.close(); } catch { /* ignore */ }
  const nextMode = lastTransportMode.indexOf('STARTTLS') >= 0 ? 'ssl465' : 'tls587';
  transporter = buildTransporter(nextMode);
  return transporter;
}

export async function sendMailSafe(opts: Record<string, unknown>, label: string): Promise<boolean> {
  const attempts = 2; // kept low: functions have a max execution time (default 10s)
  for (let i = 1; i <= attempts; i++) {
    try {
      const t = getTransporter();
      const info = await t.sendMail(opts as never);
      console.log(`[${label}] OK -> ${opts.to}${info.messageId ? ' id ' + String(info.messageId).slice(0, 25) : ''}`);
      return true;
    } catch (err: any) {
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
// EMAIL TEMPLATES
// ============================================
export function contactAdminHtml(d: { name: string; email: string; phone: string; service: string; message: string }): string {
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
export function contactAutoReplyHtml(name: string): string {
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
export function quoteAdminHtml(d: { name: string; company: string; email: string; phone: string; service: string; quantity: string; deadline: string; budget: string; details: string }, ref: string): string {
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
export function quoteAutoReplyHtml(name: string, ref: string): string {
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
export function newsletterAdminHtml(email: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#003399;padding:22px 28px;color:#fff;"><h1 style="margin:0;font-size:22px;">NEW NEWSLETTER SUBSCRIBER</h1></div>
    <div style="background:#fff;padding:28px;border:1px solid #E2E8F0;text-align:center;">
      <div style="background:#F5F7FA;padding:20px;border-radius:6px;">
        <p style="color:#003399;font-weight:bold;font-size:18px;margin:0;">${escapeHtml(email)}</p>
      </div>
    </div>
  </div>`;
}
export function newsletterAutoReplyHtml(siteUrl: string): string {
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
