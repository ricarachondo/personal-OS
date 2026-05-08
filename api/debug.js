export default function handler(req, res) {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  res.status(200).json({
    keyPresent: key.length > 0,
    keyLength: key.length,
    keyPrefix: key.slice(0, 10),
    keySuffix: key.slice(-4),
  });
}
