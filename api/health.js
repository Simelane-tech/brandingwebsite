module.exports = (req, res) => {
  res.status(200).json({ status: 'ok', service: 'Bentoks Investments Email API (Vercel)', timestamp: new Date().toISOString() });
};
