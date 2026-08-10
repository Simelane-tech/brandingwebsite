import type { Config } from '@netlify/functions';

export default async () => {
  return Response.json({ status: 'ok', service: 'Bentoks Investments Email API (Netlify Functions)', timestamp: new Date().toISOString() });
};

export const config: Config = {
  path: '/api/health'
};
