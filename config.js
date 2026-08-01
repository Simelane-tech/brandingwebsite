// ============================================
// BENTOKS INVESTMENTS - DEPLOYMENT CONFIG
// ============================================
// Leave this EMPTY ('') if this website's frontend files are served by the
// SAME backend/domain as the API (i.e. you deployed the whole "website"
// folder, server included, to one host like Render/Railway/a VPS). This is
// the default setup and needs no changes — the site will call "/api" on
// its own domain automatically, on http or https, on any domain, with no
// hardcoded hostnames or ports.
//
// Only set this if your FRONTEND and BACKEND are hosted separately — for
// example, if you deploy just the static files (this folder, minus /server)
// to Vercel/Netlify, and run the Node/Express API somewhere else like
// Render or Railway. In that case, set this to your API's full URL:
//
//   window.BENTOKS_API_BASE_URL = 'https://your-api.onrender.com';
//
window.BENTOKS_API_BASE_URL = '';
