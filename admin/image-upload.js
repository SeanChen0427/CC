const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LIMIT = 1400000;

function readDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reader.onabort = () => reject(new Error('無法讀取照片，請重新選取'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareUpload(file) {
  const inferred = /\.(jpe?g)$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : '';
  const type = file.type || inferred;
  if (!TYPES.has(type)) throw new Error('請使用 JPG、PNG 或 WebP 照片');
  if (file.size > 20000000) throw new Error('原始照片需小於 20 MB');
  if (!file.size) throw new Error('照片是空檔案，請重新選取');
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('照片讀取逾時，請重試')), 20000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('無法開啟照片，請另存為 JPG 或 PNG')); };
      image.src = source;
    });
    if (file.size <= LIMIT && Math.max(image.naturalWidth, image.naturalHeight) <= 2000) {
      return readDataURL(file.type ? file : new Blob([file], {type}));
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法處理照片，請重新整理後再試');
    let scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let size = 0; size < 4; size++, scale *= 0.75) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.8, 0.65, 0.5]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= LIMIT) return readDataURL(blob);
      }
    }
    throw new Error('照片縮圖後仍過大，請換一張照片');
  } finally {
    image.onload = image.onerror = null;
    URL.revokeObjectURL(source);
  }
}
