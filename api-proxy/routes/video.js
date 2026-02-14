import { Router } from 'express';
import { CONFIG, PROVIDER_AVAILABLE, VIDEO_ALLOWED_TIERS, VIDEO_CALL_COST } from '../config.js';
import { videoOperations } from '../state.js';
import { authenticateApiKey, authenticateAdmin } from '../middleware.js';
import { incrementUsage } from '../lib/helpers.js';

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
  const { prompt, aspectRatio } = req.body;
  const { tierConfig, usage, apiKey, tier } = req.infinite;

  if (!PROVIDER_AVAILABLE.gemini) {
    return res.status(503).json({
      error: 'provider_not_configured',
      message: 'Video generation is coming soon. Google Veo 2 will be activated after token launch.',
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
            aspectRatio: aspectRatio || '16:9',
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

    videoOperations.set(operationName, { apiKey, prompt, status: 'pending', createdAt: Date.now() });

    await incrementUsage(apiKey, VIDEO_CALL_COST - 1);  // incrementUsage adds 1, so add the rest

    res.json({
      operationName,
      status: 'pending',
      message: 'Video generation started. Poll /v1/video/status/:operationName for updates.',
      estimatedTime: '1-3 minutes',
    });
  } catch (err) {
    console.error('Video generation error:', err.message);
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

  try {
    const data = await fetchVeoOperation(operationName);

    if (data.done) {
      if (data.error) {
        videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'failed', error: data.error.message });
        return res.json({ status: 'failed', error: data.error.message });
      }

      const video = extractVideoFromResponse(data);

      const responseKeys = data.response ? Object.keys(data.response) : [];
      console.log('[Veo] Operation complete. Response keys:', responseKeys);
      console.log('[Veo] Extracted video:', video ? JSON.stringify(video).slice(0, 300) : 'null');
      if (!video) {
        console.error('[Veo] Full response:', JSON.stringify(data.response).slice(0, 1000));
      }

      if (!video?.uri) {
        videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'failed', error: 'No video in response' });
        return res.json({ status: 'failed', error: 'Video generation completed but no video was returned.' });
      }

      videoOperations.set(operationName, { ...videoOperations.get(operationName), status: 'complete', video });

      return res.json({
        status: 'complete',
        video: { uri: `/v1/video/download/${operationName}`, mimeType: video.mimeType || 'video/mp4' },
      });
    }

    res.json({ status: 'pending', metadata: data.metadata || null });
  } catch (err) {
    console.error('Video status error:', err.message);
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

// GET /v1/video/debug/* — Debug: show raw Google response for an operation
router.get('/debug/*', authenticateAdmin, async (req, res) => {
  const operationName = req.params[0];
  try {
    const data = await fetchVeoOperation(operationName);
    const video = extractVideoFromResponse(data);
    res.json({
      raw: data,
      extractedVideo: video,
      responseKeys: data.response ? Object.keys(data.response) : [],
      inMemory: videoOperations.get(operationName) || null,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /v1/video/download/* — Proxy video file download (hides API key)
router.get('/download/*', async (req, res) => {
  const operationName = req.params[0];
  const op = videoOperations.get(operationName);

  if (!op?.video?.uri) {
    return res.status(404).json({ error: 'not_found', message: 'Video not found or still processing.' });
  }

  try {
    const videoRes = await fetch(op.video.uri, {
      headers: { 'x-goog-api-key': CONFIG.GOOGLE_API_KEY },
      redirect: 'follow',
    });

    if (!videoRes.ok) {
      const errBody = await videoRes.text().catch(() => '');
      console.error('Video download upstream error:', videoRes.status, errBody.slice(0, 200));
      return res.status(502).json({ error: 'download_failed', message: `Upstream returned ${videoRes.status}` });
    }

    res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const contentLength = videoRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const arrayBuffer = await videoRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Video download error:', err.message);
    res.status(502).json({ error: 'download_failed', message: err.message });
  }
});

export default router;
