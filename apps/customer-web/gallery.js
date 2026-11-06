// Let the browser handle touch scrolling, vertical panning and pinch zoom.
export function mountGallery(root, {index = 0, onChange}) {
  const rail = root.querySelector('.product-main-image');
  const thumbs = root.querySelector('.image-thumbs');
  const buttons = [...thumbs.querySelectorAll('[data-index]')];
  const count = root.querySelector('.gallery-count');
  let current = index, frame = 0, disposed = false, start = null, blockZoomUntil = 0;
  const clamp = value => Math.max(0, Math.min(buttons.length - 1, value));
  function sync(next) {
    if (disposed) return;
    current = clamp(next);
    buttons.forEach((button, i) => {
      button.classList.toggle('selected', i === current);
      button.setAttribute('aria-pressed', String(i === current));
    });
    count.textContent = `${current + 1} / ${buttons.length}`;
    const active = buttons[current];
    if (active) {
      const item = active.getBoundingClientRect(), container = thumbs.getBoundingClientRect();
      if (item.left < container.left) thumbs.scrollLeft -= container.left - item.left;
      if (item.right > container.right) thumbs.scrollLeft += item.right - container.right;
    }
    onChange(current);
  }
  function select(next, smooth = true) {
    sync(next);
    rail.scrollTo({left: current * rail.clientWidth, behavior:smooth ? 'smooth' : 'auto'});
  }
  function scroll() {
    blockZoomUntil = performance.now() + 180;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (rail.clientWidth) sync(Math.round(rail.scrollLeft / rail.clientWidth));
    });
  }
  function down(event) { start = {x:event.clientX, y:event.clientY, id:event.pointerId}; }
  function move(event) {
    if (start && (event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10)) {
      blockZoomUntil = performance.now() + 350;
    }
  }
  function end() { start = null; }
  function cancel() { start = null; blockZoomUntil = performance.now() + 350; }
  function click(event) {
    if (performance.now() < blockZoomUntil) { event.preventDefault(); event.stopPropagation(); }
  }
  function key(event) {
    if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault(); select(current + (event.key === 'ArrowRight' ? 1 : -1));
  }
  const listeners = [['scroll',scroll,{passive:true}],['pointerdown',down,{passive:true}],['pointermove',move,{passive:true}],['pointerup',end,{passive:true}],['pointercancel',cancel,{passive:true}],['click',click,true],['keydown',key]];
  for (const [name, handler, options] of listeners) rail.addEventListener(name, handler, options);
  const resize = new ResizeObserver(() => { if (!disposed) select(current, false); });
  resize.observe(rail);
  select(index, false);
  return {
    select,
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect();
      for (const [name, handler, options] of listeners) rail.removeEventListener(name, handler, options);
    },
  };
}
