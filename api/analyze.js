export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { images, prompt } = req.body;

  const content = [
    ...images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType || "image/jpeg",
        data: img.data,
      },
    })),
    { type: "text", text: prompt },
  ];

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content }],
    }),
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    console.error("[analyze] Anthropic error:", JSON.stringify(data));
    const msg = upstream.status === 429
      ? "Demasiadas solicitudes. Espera unos segundos e intenta de nuevo."
      : data.error?.message || `Anthropic error ${upstream.status}`;
    return res.status(upstream.status).json({ error: msg });
  }

  const text = data.content?.[0]?.text ?? "";
  return res.status(200).json({ text });
}
