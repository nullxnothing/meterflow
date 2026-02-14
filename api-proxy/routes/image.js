import { Router } from 'express';
import crypto from 'crypto';
import { CONFIG, PROVIDER_AVAILABLE } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';

const router = Router();

// POST /v1/image — Generate image via Gemini
router.post('/image', authenticateApiKey, async (req, res) => {
  const { prompt } = req.body;
  const { tierConfig, usage, apiKey } = req.infinite;

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Image generation is coming soon. Gemini API will be activated after token launch.',
    });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
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
      return res.status(422).json({
        error: 'no_image_generated',
        message: text || 'The model did not return an image. Try a different prompt.',
      });
    }

    await incrementUsage(apiKey);

    res.json({
      id: `inf-img-${crypto.randomBytes(8).toString('hex')}`,
      images,
      text,
      usage: { cost: '$0.00 — funded by $INFINITE treasury' }
    });

  } catch (err) {
    console.error('Image generation error:', err.message);
    res.status(502).json({
      error: 'upstream_error',
      message: 'Image generation failed. Try a different prompt.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
