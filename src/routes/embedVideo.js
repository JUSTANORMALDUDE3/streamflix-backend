const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect, authorizeRoles } = require('../middleware/auth');
const { parseIframe } = require('../utils/iframeParser');
const { detectThumbnail } = require('../utils/thumbnailDetect');
const Video = require('../models/Video');

// -------------------------------------------------------
// GET /admin/embed/thumbnail?src=<embedSrc>
// Tries to auto-detect a thumbnail for an embed URL:
//   1. Pattern-based (YouTube, Dailymotion)
//   2. Fetch the page HTML and extract og:image
// -------------------------------------------------------
router.get('/thumbnail', protect, authorizeRoles('admin'), async (req, res) => {
    const { src } = req.query;
    if (!src) return res.status(400).json({ thumbnailUrl: null });

    // 1. Fast pattern check
    const fast = detectThumbnail(src);
    if (fast) return res.json({ thumbnailUrl: fast });

    // 2. Try fetching og:image from the embed page
    try {
        const response = await axios.get(src, {
            timeout: 6000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ThumbnailBot/1.0)',
                'Accept': 'text/html',
            },
            maxRedirects: 5,
        });
        const html = response.data || '';

        // Try og:image first, then twitter:image
        const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

        const thumb = (ogMatch || twitterMatch)?.[1] || null;
        return res.json({ thumbnailUrl: thumb });
    } catch {
        return res.json({ thumbnailUrl: null });
    }
});

// -------------------------------------------------------
// GET /admin/embed/video-url?src=<embedSrc>
// Fetches the embed page and extracts the highest-quality
// direct video file URL from common player configs.
// -------------------------------------------------------
router.get('/video-url', protect, authorizeRoles('admin'), async (req, res) => {
    const { src } = req.query;
    if (!src) return res.status(400).json({ videoUrl: null });

    try {
        const response = await axios.get(src, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': (() => { try { return new URL(src).origin; } catch { return src; } })(),
            },
            maxRedirects: 5,
        });
        const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        const candidates = []; // { url, label }

        // 1. HTML5 <source> tags with res/label/size attribute
        const sourceTagRe = /<source[^>]+src=["']([^"']+\.(?:mp4|webm|ogv|m3u8|ogg)[^"']*?)["'][^>]*(?:res|label|size)=["']([^"']+)["']/gi;
        let m;
        while ((m = sourceTagRe.exec(html)) !== null) candidates.push({ url: m[1], label: m[2] });

        // 2. Plain <source> tags (no label)
        const plainSourceRe = /<source[^>]+src=["']([^"']+\.(?:mp4|webm|ogv|m3u8)[^"']*?)["']/gi;
        while ((m = plainSourceRe.exec(html)) !== null) {
            if (!candidates.find(c => c.url === m[1])) candidates.push({ url: m[1], label: '' });
        }

        // 3. JWPlayer/Plyr sources: {"file":"url","label":"720p"} or {"src":"url","size":720}
        const jwRe = /\{[^{}]*?(?:"file"|"src")\s*:\s*["']([^"']+\.(?:mp4|webm|m3u8)[^"']*?)["'][^{}]*?(?:"label"|"size")\s*:\s*["']?([^"',}\s]+)/gi;
        while ((m = jwRe.exec(html)) !== null) candidates.push({ url: m[1], label: String(m[2]) });

        // 4. Bare quoted video URLs anywhere in the page
        const bareRe = /["'`](https?:\/\/[^"'`\s]+\.(?:mp4|webm|m3u8|ogv|ogg)(?:[?#][^"'`\s]*)?)["'`]/gi;
        while ((m = bareRe.exec(html)) !== null) {
            if (!candidates.find(c => c.url === m[1])) candidates.push({ url: m[1], label: '' });
        }

        if (candidates.length === 0) {
            return res.json({ videoUrl: null, quality: null, message: 'No direct video URLs found in embed page.' });
        }

        // Pick highest quality by label
        const QUALITY_ORDER = ['2160', '4k', '1440', '1080', '720', '480', '360', '240'];
        const scoreLabel = (label) => {
            const l = String(label).toLowerCase();
            for (let i = 0; i < QUALITY_ORDER.length; i++) if (l.includes(QUALITY_ORDER[i])) return QUALITY_ORDER.length - i;
            if (l.includes('m3u8') || l.includes('hls')) return QUALITY_ORDER.length + 1;
            return 0;
        };
        const sorted = candidates.sort((a, b) => scoreLabel(b.label) - scoreLabel(a.label));
        const best = sorted[0];

        return res.json({ videoUrl: best.url, quality: best.label || 'auto', allSources: sorted });
    } catch (err) {
        console.error('Video URL extraction error:', err.message);
        return res.json({ videoUrl: null, quality: null, message: err.message });
    }
});

// -------------------------------------------------------
// POST /admin/embed
// Saves an embed video (iframe-based) to MongoDB.
// Body: { title, description, rank, iframeCode, thumbnailUrl }
// -------------------------------------------------------
router.post('/', protect, authorizeRoles('admin'), async (req, res) => {
    try {
        const { title, description, rank, iframeCode, thumbnailUrl, directVideoUrl } = req.body;

        if (!title || !rank || !iframeCode) {
            return res.status(400).json({ message: 'title, rank, and iframeCode are required.' });
        }

        const embed = parseIframe(iframeCode);

        if (!embed.src) {
            return res.status(400).json({ message: 'Could not extract a src from the iframe code. Make sure it contains src="...".' });
        }

        // If a higher-quality direct video URL was extracted, use it as the embed src
        // so Watch.jsx DIRECT_VIDEO_EXTS check picks it up and uses the custom player
        if (directVideoUrl) {
            embed.src = directVideoUrl;
        }

        const thumb = thumbnailUrl || detectThumbnail(embed.src) || '';

        const video = await Video.create({
            title,
            description: description || '',
            rank,
            type: 'embed',
            embed,
            thumbnailUrl: thumb,
            uploadDate: new Date(),
        });

        res.status(201).json({ success: true, video });
    } catch (err) {
        console.error('Embed save error:', err);
        res.status(500).json({ message: 'Failed to save embed video.', error: err.message });
    }
});


module.exports = router;
