export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { images, prompt } = await req.json();

  const content = [
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
    { type: "text", text: prompt },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

  const data = await res.json();

  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || `OpenRouter error ${res.status}` }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
}
