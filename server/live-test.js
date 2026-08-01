// Quick end-to-end HTTP test: HITS THE LIVE API & forces socket-close handling paths
const http = require('http');
const url = process.argv[2] || 'http://localhost:3000';
const PARSED = new URL(url);
const PORT = parseInt(PARSED.port || '80');
const HOST = PARSED.hostname;
const TO = process.env.TEST_TO || 'kwanele.simelane10536@gmail.com';

function jsonPost(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: HOST, port: PORT, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch(e){ resolve({ status: res.statusCode, raw: b }); }
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}${path}`, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ s: res.statusCode, b }));
    }).on('error', reject);
  });
}

(async () => {
  console.log('Testing:', `http://${HOST}:${PORT}`);
  try {
    const h = await get('/api/health');
    console.log('Health:', h.s, h.b);
  } catch(e){ console.log('Health fail:', e.message); }

  console.log('\n--- Test 1: POST /api/subscribe (newsletter) ---');
  try {
    const r = await jsonPost('/api/subscribe', { email: TO });
    console.log('Status:', r.status, '\nBody:', JSON.stringify(r.body, null, 2));
  } catch(e){ console.log('Error:', e.message); }

  console.log('\n--- Test 2: POST /api/contact ---');
  try {
    const r = await jsonPost('/api/contact', {
      name: 'Socket Fix Test',
      email: TO,
      phone: '+268 7632 0436',
      service: 'Flyers & Advertising Prints',
      message: 'Verifying that "Unexpected socket close" is fixed! 3-attempt retry + SSL↔TLS swap is now active.'
    });
    console.log('Status:', r.status, '\nBody:', JSON.stringify(r.body, null, 2));
  } catch(e){ console.log('Error:', e.message); }

  console.log('\n--- Test 3: POST /api/quote ---');
  try {
    const r = await jsonPost('/api/quote', {
      name: 'Socket Fix Quote',
      company: 'Socket Savers (Pty) Ltd',
      email: TO, phone: '+268 7932 0436',
      service: 'Signage',
      quantity: '20 large format signs',
      deadline: 'End of August 2026',
      budget: 'E40,000 - E60,000',
      details: 'Testing that SSL 465 failures automatically swap to STARTTLS 587. Also verifying 3 retries before failing.'
    });
    console.log('Status:', r.status, '\nBody:', JSON.stringify(r.body, null, 2));
  } catch(e){ console.log('Error:', e.message); }

  console.log('\n✅ All HTTP tests sent — watch the server terminal above for logs of each send + retry!');
})();
