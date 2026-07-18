export default function handler(req, res) {
  const xff = req.headers['x-forwarded-for'] || '';
  const ip = (typeof xff === 'string' ? xff.split(',')[0].trim() : '') || req.headers['x-real-ip'] || req.socket?.remoteAddress || '0.0.0.0';
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ ip, day: new Date().toISOString().slice(0,10) });
}
