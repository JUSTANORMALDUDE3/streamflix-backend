/**
 * Parses an iframe HTML string and extracts src, width, height.
 * Handles both double-quoted and single-quoted attribute values.
 */
const parseIframe = (iframeCode) => {
    if (!iframeCode) return { src: null, width: 640, height: 360 };

    const srcMatch = iframeCode.match(/src=["']([^"']+)["']/i);
    const widthMatch = iframeCode.match(/width=["'](\d+)["']/i);
    const heightMatch = iframeCode.match(/height=["'](\d+)["']/i);

    return {
        src: srcMatch ? srcMatch[1] : null,
        width: widthMatch ? parseInt(widthMatch[1], 10) : 640,
        height: heightMatch ? parseInt(heightMatch[1], 10) : 360,
    };
};

module.exports = { parseIframe };
