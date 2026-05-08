import { Router } from 'express';
import crypto from 'crypto';
import { CONFIG, PROVIDER_AVAILABLE } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { completeMeteredRequest } from '../lib/control-plane.js';

const router = Router();

// POST /v1/image — Generate image via Gemini
router.post('/image', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const { prompt } = req.body;
  const { tierConfig, usage, apiKey } = req.meterflow;

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Image generation requires a configured Gemini provider key.',
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
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
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
      logger.warn('Image generation returned no image', {
        prompt: prompt.slice(0, 120),
        modelResponse: text.slice(0, 300),
      });
      return res.status(422).json({
        error: 'no_image_generated',
        message: text || 'The model did not return an image. Try a different prompt.',
      });
    }

    await Promise.all([
      incrementUsage(apiKey),
      completeMeteredRequest(req, {
        status: 'metered_key',
        responseStatus: 200,
        latencyMs: Date.now() - startedAt,
      }),
    ]);

    res.json({
      id: `mf-img-${crypto.randomBytes(8).toString('hex')}`,
      images,
      text,
      usage: { cost: 'metered by Meterflow' }
    });

  } catch (err) {
    completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: 502,
      latencyMs: Date.now() - startedAt,
      error: err.message,
    }).catch(() => {});
    logger.error('Image generation error', { err: err.message });
    res.status(502).json({
      error: 'upstream_error',
      message: 'Image generation failed. Try a different prompt.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
