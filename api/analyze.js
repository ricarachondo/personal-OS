export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }
  // debug temporal — eliminar después
  console.log("[analyze] key prefix:", apiKey.slice(0, 10), "len:", apiKey.length);

  const { images, prompt } = req.body;

  const content = [
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
    { type: "text", text: prompt },
  ];

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://splitr-boleta.vercel.app",
      "X-Title": "Splitr",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [{ role: "user", content }],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    console.error("[analyze] OpenRouter error:", JSON.stringify(data));
    return res.status(upstream.status).json({ error: data.error?.message || `OpenRouter error ${upstream.status}` });
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  return res.status(200).json({ text });
}
