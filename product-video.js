import { youtubeVideo } from './youtube.js?v=0.3.27';

let current = null;
export function closeProductVideo() { current?.close(); }

export function openProductVideo(product, { returnLabel = '返回選購' } = {}) {
  const video = youtubeVideo(product.videoUrl);
  if (!video) return false;
  closeProductVideo();
  const dialog = document.createElement('dialog');
  dialog.className = 'product-video-dialog';
  dialog.setAttribute('aria-labelledby', 'product-video-heading');
  dialog.innerHTML = `<div class="product-video-header"><div><div class="eyebrow">商品影片</div><h2 id="product-video-heading"></h2></div><button class="product-video-close" type="button" aria-label="關閉影片">×</button></div><div class="product-video-frame"><iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="product-video-footer"><p>若無法播放，請在 YouTube 開啟</p><div class="product-video-actions"><button type="button" class="secondary-button" data-video-return></button><a class="text-button" target="_blank" rel="noopener noreferrer">在 YouTube 開啟 ↗</a></div></div>`;
  dialog.querySelector('h2').textContent = product.name;
  dialog.querySelector('[data-video-return]').textContent = returnLabel;
  dialog.querySelector('a').href = video.url;
  dialog.querySelector('.product-video-frame').classList.toggle('horizontal', product.videoLayout === 'horizontal');
  const frame = dialog.querySelector('iframe');
  frame.title = `${product.name} 商品介紹影片`;
  const previousOverflow = document.body.style.overflow;
  let disposed = false;
  function close() {
    if (disposed) return;
    disposed = true;
    // Removing the browsing context stops playback even when native dialog.close()
    // leaves hidden content alive. Keep the product DOM and selection untouched.
    frame.remove();
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.style.overflow = previousOverflow;
    window.removeEventListener('hashchange', close);
    window.removeEventListener('pagehide', close);
    current = null;
  }
  dialog.querySelector('.product-video-close').addEventListener('click', close);
  dialog.querySelector('[data-video-return]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  window.addEventListener('hashchange', close);
  window.addEventListener('pagehide', close);
  current = { close };
  document.body.append(dialog);
  document.body.style.overflow = 'hidden';
  dialog.showModal();
  frame.src = video.embedUrl;
  return true;
}
