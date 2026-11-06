import { prepareUpload } from './image-upload.js?v=0.3.4';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const colorsIn = value => [...new Set(value.split(/[,，]/).map(x => x.trim()).filter(Boolean))];

export function mountImageEditor(root, { images = [], bindings = [], colorsInput, upload, onChange }) {
  let items = images.map(url => ({ id: crypto.randomUUID(), url, status: 'done' }));
  let links = [...bindings], running = false, disposed = false, dragged = null, notice = '';
  let controller;
  const enabled = bindings.length > 0;
  root.innerHTML = `<div class="photo-editor-heading"><h3>商品照片</h3><span id="photo-count"></span></div>
    <div class="photo-dropzone" tabindex="0" role="button" aria-label="選取或拖曳多張商品照片"><strong>拖曳多張照片到這裡</strong><span>或點一下選取照片，可分批追加</span><input type="file" id="image-upload" multiple accept="image/png,image/jpeg,image/webp" hidden></div>
    <p class="photo-help">最多 8 張，較大的照片會自動縮圖，支援 JPG／PNG／WebP，原檔每張 20 MB 以內</p>
    <p class="photo-help">拖曳照片或使用左右按鈕調整順序，第一張就是封面</p>
    <div id="image-list" class="photo-list" aria-label="商品照片排序"></div>
    <p id="photo-notice" class="photo-notice" role="status" aria-live="polite"></p>
    <label class="checkbox-label photo-binding-toggle"><input type="checkbox" id="bind-photos" ${enabled ? 'checked' : ''}>依顏色切換照片（選填）</label>
    <p class="photo-help">預設照片與規格分開，勾選後再指定各顏色對應的照片</p><div id="photo-bindings" class="photo-bindings"></div>`;
  const $ = selector => root.querySelector(selector);
  const input = $('#image-upload'), zone = $('.photo-dropzone'), list = $('#image-list');
  const urls = () => items.filter(item => item.status === 'done').map(item => item.url);
  function currentBindings() {
    const images = urls(), colors = colorsIn(colorsInput.value);
    return $('#bind-photos').checked ? links.filter(link => colors.includes(link.color) && images.includes(link.url)) : [];
  }
  function renderBindings() {
    const section = $('#photo-bindings');
    section.hidden = !$('#bind-photos').checked;
    const images = urls();
    section.innerHTML = colorsIn(colorsInput.value).map(color => `<label class="field">${esc(color)}<select data-color="${esc(color)}" aria-label="${esc(color)}對應照片"><option value="">不綁定</option>${images.map((url, index) => `<option value="${esc(url)}" ${links.some(link => link.color === color && link.url === url) ? 'selected' : ''}>第 ${index + 1} 張${index === 0 ? '（封面）' : ''}</option>`).join('')}</select></label>`).join('');
  }
  function render() {
    if (disposed) return;
    $('#photo-count').textContent = `${urls().length} / 8 張`;
    list.innerHTML = items.map((item, index) => `<div class="photo-card ${item.status === 'error' ? 'has-error' : ''}" draggable="${item.status === 'done'}" data-photo-id="${item.id}">
      <div class="photo-card-image"><img src="${esc(item.url || item.preview)}" alt="商品照片 ${index + 1}" draggable="false"><span class="photo-number">${index === 0 ? '封面' : index + 1}</span></div>
      <span class="photo-file-name" title="${esc(item.file?.name || '')}">${esc(item.file?.name || `照片 ${index + 1}`)}</span>
      <div class="photo-status" ${item.status === 'error' ? 'role="alert"' : ''}>${esc(({done:'已就緒',pending:'等待上傳',processing:'處理照片中',uploading:'上傳中',error:item.error})[item.status])}</div>
      <div class="photo-card-actions"><button type="button" data-photo-action="left" aria-label="將照片 ${index + 1} 往前移" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" data-photo-action="right" aria-label="將照片 ${index + 1} 往後移" ${index === items.length - 1 ? 'disabled' : ''}>→</button>${item.status === 'error' ? '<button type="button" data-photo-action="retry">重試</button>' : ''}<button type="button" data-photo-action="remove" aria-label="移除照片 ${index + 1}">移除</button></div>
    </div>`).join('');
    $('#photo-notice').textContent = notice || (items.some(item => item.status === 'error') ? '有照片上傳失敗，請重試或移除後再儲存' : running ? '照片依序上傳中，請稍候' : '');
    renderBindings();
    onChange({ busy: running || items.some(item => ['pending','processing','uploading'].includes(item.status)), failed: items.some(item => item.status === 'error') });
  }
  async function run() {
    if (running || disposed) return;
    running = true;
    try {
      let item;
      while (!disposed && (item = items.find(item => item.status === 'pending'))) {
        try {
          item.status = 'processing'; render();
          const data = await prepareUpload(item.file);
          if (disposed || !items.includes(item)) continue;
          item.status = 'uploading'; render();
          controller = new AbortController();
          const timer = setTimeout(() => controller?.abort(), 45000);
          let result;
          try { result = await upload(data, controller.signal); }
          finally { clearTimeout(timer); controller = null; }
          if (disposed || !items.includes(item)) continue;
          if (!result?.url) throw new Error('上傳未完成，請重試');
          item.url = result.url; item.status = 'done';
          URL.revokeObjectURL(item.preview); item.preview = null; item.file = null;
        } catch (error) {
          item.status = 'error'; item.error = error.name === 'AbortError' ? '上傳逾時，請重試' : error.message;
        }
        render();
      }
    } finally { running = false; render(); }
  }
  function add(files) {
    if (disposed) return;
    const available = Math.max(0, 8 - items.length), selected = Array.from(files);
    notice = selected.length > available ? `最多 8 張，本次加入 ${Math.min(available, selected.length)} 張，其餘請移除照片後再加入` : '';
    items.push(...selected.slice(0, available).map(file => ({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file),status:'pending'})));
    input.value = ''; render(); void run();
  }
  function move(from, to) {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
    items.splice(to, 0, items.splice(from, 1)[0]); render();
  }
  input.addEventListener('change', () => add(input.files));
  zone.addEventListener('click', event => { if (event.target !== input) input.click(); });
  zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  root.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) zone.classList.add('drag-over'); });
  root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) zone.classList.remove('drag-over'); });
  root.addEventListener('drop', event => {
    event.preventDefault(); zone.classList.remove('drag-over');
    if (event.dataTransfer.files.length) { add(event.dataTransfer.files); return; }
    const card = event.target.closest('[data-photo-id]');
    if (dragged && card) move(items.findIndex(item => item.id === dragged), items.findIndex(item => item.id === card.dataset.photoId));
    dragged = null;
  });
  list.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-photo-id]');
    if (!card || card.draggable === false) return;
    dragged = card.dataset.photoId; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragged);
  });
  list.addEventListener('dragend', () => { dragged = null; });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-photo-action]'); if (!button) return;
    const index = items.findIndex(item => item.id === button.closest('[data-photo-id]').dataset.photoId), item = items[index];
    if (!item) return;
    const action = button.dataset.photoAction;
    if (action === 'left' || action === 'right') move(index, index + (action === 'left' ? -1 : 1));
    if (action === 'remove') { if (item.preview) URL.revokeObjectURL(item.preview); items.splice(index, 1); links = links.filter(link => link.url !== item.url); notice = ''; render(); }
    if (action === 'retry') { item.status = 'pending'; item.error = ''; notice = ''; render(); void run(); }
  });
  $('#bind-photos').addEventListener('change', renderBindings);
  $('#photo-bindings').addEventListener('change', event => {
    const color = event.target.dataset.color; if (color === undefined) return;
    links = links.filter(link => link.color !== color);
    if (event.target.value) links.push({color,url:event.target.value});
  });
  colorsInput.addEventListener('input', renderBindings);
  render();
  return {
    get busy() { return running || items.some(item => item.status !== 'done'); },
    value() { return { images: urls(), imageBindings: currentBindings() }; },
    dispose() { disposed = true; controller?.abort(); for (const item of items) if (item.preview) URL.revokeObjectURL(item.preview); colorsInput.removeEventListener('input', renderBindings); },
  };
}
