export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
  }

  const { images, prompt } = req.body;

  const content = [
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
    { type: "text", text: prompt },
  ];

  const callUpstream = () =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://splitr-boleta.vercel.app",
        "X-Title": "Splitr",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [{ role: "user", content }],
        max_tokens: 2000,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

  let upstream = await callUpstream();

  // Retry once on rate limit after a short wait
  if (upstream.status === 429) {
    await new Promise((r) => setTimeout(r, 3000));
    upstream = await callUpstream();
  }

  const data = await upstream.json();

  if (!upstream.ok) {
    console.error("[analyze] OpenRouter error:", JSON.stringify(data));
    const msg = upstream.status === 429
      ? "Demasiadas solicitudes. Espera unos segundos e intenta de nuevo."
      : data.error?.message || `OpenRouter error ${upstream.status}`;
    return res.status(upstream.status).json({ error: msg });
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  return res.status(200).json({ text });
}
