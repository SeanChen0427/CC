// Parse only supported YouTube destinations. Never embed a submitted URL directly.
export function youtubeVideo(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input || input.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(input) || !/^https:\/\//i.test(input)) return null;
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  let id, shorts = false;
  if (url.hostname === 'youtu.be') id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else {
      const match = url.pathname.match(/^\/(shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/);
      id = match?.[2]; shorts = match?.[1] === 'shorts';
    }
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) id = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
  return {
    id,
    url: shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`,
  };
}
