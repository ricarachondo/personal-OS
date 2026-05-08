export default async function handler(req, res) {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";

  // Test the key with a minimal text-only request
  const testRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [{ role: "user", content: "say: ok" }],
      max_tokens: 5,
    }),
  });

  const data = await testRes.json();
  res.status(200).json({
    keyLength: key.length,
    keyPrefix: key.slice(0, 10),
    openRouterStatus: testRes.status,
    openRouterResponse: data,
  });
}
