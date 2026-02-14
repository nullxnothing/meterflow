import { CONFIG, PROVIDER_AVAILABLE } from '../config.js';

export async function executeImageGenerate({ prompt }) {
  if (!prompt) {
    return { error: 'Prompt is required for image generation' };
  }

  if (!PROVIDER_AVAILABLE.gemini) {
    return { 
      error: 'Image generation is not available yet',
      message: 'Gemini API will be activated after token launch.'
    };
  }

  try {
    const imageModel = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT']
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini Image ${response.status}: ${err}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    const images = [];
    let text = '';

    for (const part of parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data
        });
      }
      if (part.text) {
        text += part.text;
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        error: 'No image generated',
        message: text || 'The model did not return an image. Try a different prompt.',
      };
    }

    return {
      success: true,
      images,
      text,
      prompt,
    };
  } catch (err) {
    return {
      error: 'Image generation failed',
      message: err.message,
    };
  }
}
