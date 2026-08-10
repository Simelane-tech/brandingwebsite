export default async (req) => {
  return Response.json({ status: 'ok', service: 'Bentoks Investments Email API (Netlify)', timestamp: new Date().toISOString() });
};

export const config = {
  path: '/api/health'
};
