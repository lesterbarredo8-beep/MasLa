const GEMINI_API_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const DETAIL_INSTRUCTIONS = {
  simple: 'Provide a concise recipe with essential ingredients and 4-6 main cooking steps.',
  standard: 'Provide a well-detailed recipe with exact ingredient measurements and 6-8 clear cooking steps.',
  detailed:
    'Provide a very detailed professional recipe with precise measurements, preparation tips, plating suggestions, and 8-12 thorough cooking steps.',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function buildPrompt(language, detailLevel) {
  const detailInstructions = DETAIL_INSTRUCTIONS[detailLevel] || DETAIL_INSTRUCTIONS.standard;

  return `You are a world-class culinary AI. Analyze the food in this image and respond ONLY with a valid JSON object — no markdown, no code fences, no extra text.

Language for the response: ${language}
Detail level: ${detailInstructions}

JSON schema (all fields required):
{
  "foodName": "Name of the dish",
  "cuisine": "Cuisine type (e.g. Italian, Filipino, Thai)",
  "description": "2-3 sentence appetizing description of the dish",
  "prepTime": "e.g. 30 minutes",
  "calories": "e.g. 450 kcal per serving",
  "difficulty": "Easy | Medium | Hard",
  "servings": "e.g. 4 servings",
  "tips": "1-2 chef tips for best results",
  "ingredients": [
    { "name": "Ingredient name", "amount": "quantity + unit" }
  ],
  "steps": [
    "Step description"
  ]
}

If you cannot identify food in the image, respond with:
{ "error": "No food detected in the image. Please try a clearer photo of a dish." }`;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Recipe detection is temporarily unavailable. Please try again later.',
    });
  }

  const { imageBase64, mimeType, language = 'English', detailLevel = 'standard' } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'A food photo is required.' });
  }

  if (!mimeType || !/^image\//.test(mimeType)) {
    return res.status(400).json({ error: 'Invalid image type.' });
  }

  const allowedDetails = ['simple', 'standard', 'detailed'];
  const safeDetail = allowedDetails.includes(detailLevel) ? detailLevel : 'standard';
  const safeLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'English';

  const imageBytes = Buffer.byteLength(imageBase64, 'base64');
  if (imageBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'Image is too large. Please use a smaller photo.' });
  }

  try {
    const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(safeLanguage, safeDetail) },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `API error: ${response.status}`;

      if (response.status === 429 || /quota/i.test(errMsg)) {
        return res.status(429).json({ error: 'Service is busy. Please try again in a moment.' });
      }

      console.error('Gemini API error:', errMsg);
      return res.status(502).json({ error: `Could not analyze the photo: ${errMsg}` });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from recipe service.' });
    }

    const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
    const recipe = JSON.parse(cleaned);

    return res.status(200).json(recipe);
  } catch (err) {
    console.error('detect-recipe error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
