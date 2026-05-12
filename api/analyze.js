const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGES = 5;
const MAX_IMAGE_B64_BYTES = 5 * 1024 * 1024; // ~5 MB per image (base64)
const MAX_PROMPT_LENGTH = 8000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  // ── Token auth ────────────────────────────────────────────────────────────
  const expectedToken = process.env.SPLITR_TOKEN?.trim();
  const receivedToken = req.headers["x-splitr-token"]?.trim();
  if (expectedToken && receivedToken !== expectedToken) {
    return res.status(401).json({ error: "No autorizado." });
  }

  // ── Input validation ─────────────────────────────────────────────────────
  const { images, prompt } = req.body ?? {};

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: "Se requiere al menos una imagen." });
  }
  if (images.length > MAX_IMAGES) {
    return res.status(400).json({ error: `Máximo ${MAX_IMAGES} imágenes por solicitud.` });
  }
  if (typeof prompt !== "string" || prompt.length === 0) {
    return res.status(400).json({ error: "Prompt inválido." });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: "Prompt demasiado largo." });
  }

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img?.data !== "string" || img.data.length === 0) {
      return res.status(400).json({ error: `Imagen ${i + 1} inválida.` });
    }
    if (img.data.length > MAX_IMAGE_B64_BYTES) {
      return res.status(400).json({ error: `Imagen ${i + 1} supera el tamaño máximo permitido.` });
    }
    const mediaType = ALLOWED_MEDIA_TYPES.has(img.mediaType) ? img.mediaType : "image/jpeg";
    img._safeMediaType = mediaType;
  }

  // ── Build request ─────────────────────────────────────────────────────────
  const content = [
    ...images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img._safeMediaType,
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
    console.error("[analyze] Anthropic error:", upstream.status, data?.error?.type);
    const msg = upstream.status === 429
      ? "Demasiadas solicitudes. Espera unos segundos e intenta de nuevo."
      : "Error al analizar la boleta. Intenta nuevamente.";
    return res.status(upstream.status).json({ error: msg });
  }

  const text = data.content?.[0]?.text ?? "";
  return res.status(200).json({ text });
}
