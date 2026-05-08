import { Router } from 'express';
import { CONFIG, PROVIDER_AVAILABLE, VIDEO_ALLOWED_TIERS, VIDEO_CALL_COST } from '../config.js';
import { getVideoOp, setVideoOp } from '../lib/kv-videos.js';
import { authenticateApiKey, authenticateAdmin } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';
import { logger } from '../lib/logger.js';
import { completeMeteredRequest } from '../lib/control-plane.js';

const router = Router();

async function fetchVeoOperation(operationName) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
    { headers: { 'x-goog-api-key': CONFIG.GOOGLE_API_KEY } }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Veo status ${response.status}: ${err}`);
  }
  return response.json();
}

function extractVideoFromResponse(data) {
  return data.response?.generatedVideos?.[0]?.video
    || data.response?.generateVideoResponse?.generatedSamples?.[0]?.video
    || data.response?.videos?.[0]
    || null;
}

// POST /v1/video/generate — Start async video generation via Veo 2
router.post('/generate', authenticateApiKey, async (req, res) => {
  const startedAt = Date.now();
  const { prompt, aspectRatio } = req.body;
  // Acceptable aspect ratios: 16:9, 9:16, 1:1, 1:!, etc.
  const VALID_ASPECTS = ['16:9', '9:16', '1:1', '1:!'];
  let safeAspect = aspectRatio || '16:9';
  if (!VALID_ASPECTS.includes(safeAspect)) {
    return res.status(400).json({ error: 'invalid_aspect_ratio', message: `Aspect ratio '${safeAspect}' is not supported.` });
  }
  const { tierConfig, usage, apiKey, tier } = req.meterflow;

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Video generation requires a configured Gemini/Veo provider key.',
    });
  }

  if (!VIDEO_ALLOWED_TIERS.includes(tier)) {
    return res.status(403).json({
      error: 'tier_restricted',
      message: 'Video generation requires Operator tier or above.',
      requiredTier: 'Operator',
      currentTier: tierConfig.label,
    });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': CONFIG.GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            aspectRatio: safeAspect,
            resolution: '720p',
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Veo ${response.status}: ${err}`);
    }

    const data = await response.json();
    const operationName = data.name;

    if (!operationName) {
      throw new Error('No operation name returned from Veo API');
    }

    await setVideoOp(operationName, { apiKey, prompt, status: 'pending', createdAt: Date.now() });
    await Promise.all([
      incrementUsage(apiKey, VIDEO_CALL_COST - 1),
      completeMeteredRequest(req, {
        status: 'metered_key',
        responseStatus: 200,
        latencyMs: Date.now() - startedAt,
        tokens: VIDEO_CALL_COST,
      }),
    ]);

    res.json({
      operationName,
      status: 'pending',
      message: 'Video generation started. Poll /v1/video/status/:operationName for updates.',
      estimatedTime: '1-3 minutes',
    });
  } catch (err) {
    completeMeteredRequest(req, {
      status: 'upstream_error',
      responseStatus: 502,
      latencyMs: Date.now() - startedAt,
      error: err.message,
    }).catch(() => {});
    logger.error('Video generation error', { err: err.message });
    res.status(502).json({
      error: 'upstream_error',
      message: 'Video generation failed. Try a different prompt.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// GET /v1/video/status/* — Poll video generation status
router.get('/status/*', authenticateApiKey, async (req, res) => {
  const operationName = req.params[0];
  const op = await getVideoOp(operationName);
  if (op && op.apiKey !== req.meterflow.apiKey) {
    return res.status(403).json({ error: 'forbidden', message: 'This video belongs to another user.' });
  }

  try {
    const data = await fetchVeoOperation(operationName);

    if (data.done) {
      if (data.error) {
        await setVideoOp(operationName, { ...op, status: 'failed', error: data.error.message });
        return res.json({ status: 'failed', error: data.error.message });
      }

      const video = extractVideoFromResponse(data);

      const responseKeys = data.response ? Object.keys(data.response) : [];
      logger.info('Veo operation complete', { responseKeys });
      if (!video) {
        logger.error('Veo missing video in response', { response: JSON.stringify(data.response).slice(0, 1000) });
      }

      if (!video?.uri) {
        await setVideoOp(operationName, { ...op, status: 'failed', error: 'No video in response' });
        return res.json({ status: 'failed', error: 'Video generation completed but no video was returned.' });
      }

      await setVideoOp(operationName, { ...op, status: 'complete', video });

      return res.json({
        status: 'complete',
        video: { uri: `/v1/video/download/${operationName}`, mimeType: video.mimeType || 'video/mp4' },
      });
    }

    res.json({ status: 'pending', metadata: data.metadata || null });
  } catch (err) {
    logger.error('Video status error', { err: err.message });
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

// GET /v1/video/debug/* — Debug: show raw Google response for an operation
router.get('/debug/*', authenticateAdmin, async (req, res) => {
  const operationName = req.params[0];
  try {
    const data = await fetchVeoOperation(operationName);
    const video = extractVideoFromResponse(data);
    const stored = await getVideoOp(operationName);
    res.json({
      raw: data,
      extractedVideo: video,
      responseKeys: data.response ? Object.keys(data.response) : [],
      stored,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /v1/video/download/* — Proxy video file download (hides API key)
// Supports both Authorization header and ?token= query param (for <video src>)
router.get('/download/*', async (req, res) => {
  const operationName = req.params[0];
  let op = await getVideoOp(operationName);

  const headerKey = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null;
  const queryKey = req.query.token;
  const apiKey = headerKey || queryKey;

  // If op is missing from Redis, attempt live recovery from Google.
  if (!op?.video?.uri && apiKey) {
    try {
      const data = await fetchVeoOperation(operationName);
      if (data.done && !data.error) {
        const video = extractVideoFromResponse(data);
        if (video?.uri) {
          op = { apiKey, status: 'complete', video, recoveredAt: Date.now() };
          await setVideoOp(operationName, op);
          logger.info('Video op recovered from Google API', { operationName });
        }
      }
    } catch (e) {
      logger.warn('Video op recovery attempt failed', { operationName, err: e.message });
    }
  }

  if (!op?.video?.uri) {
    return res.status(404).json({ error: 'not_found', message: 'Video not found or still processing.' });
  }

  if (!apiKey || apiKey !== op.apiKey) {
    return res.status(403).json({ error: 'forbidden', message: 'Invalid or missing API key.' });
  }

  try {
    const videoRes = await fetch(op.video.uri, {
      headers: { 'x-goog-api-key': CONFIG.GOOGLE_API_KEY },
      redirect: 'follow',
    });

    if (!videoRes.ok) {
      const errBody = await videoRes.text().catch(() => '');
      logger.error('Video download upstream error', { status: videoRes.status, body: errBody.slice(0, 200) });
      return res.status(502).json({ error: 'download_failed', message: `Upstream returned ${videoRes.status}` });
    }

    res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const contentLength = videoRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const arrayBuffer = await videoRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    logger.error('Video download error', { err: err.message });
    res.status(502).json({ error: 'download_failed', message: err.message });
  }
});

export default router;
