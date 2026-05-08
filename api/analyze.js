export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { images, prompt } = await req.json();

  const parts = [
    ...images.map((img) => ({
      inline_data: { mime_type: img.mediaType, data: img.data },
    })),
    { text: prompt },
  ];

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.1 },
      }),
    }
  );

  const data = await geminiRes.json();

  if (!geminiRes.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || `Gemini error ${geminiRes.status}` }), {
      status: geminiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  });
}
