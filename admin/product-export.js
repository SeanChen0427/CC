const SIZE = 144;

async function thumbnail(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(()=>reject(new Error('照片讀取逾時，請重試')),20000);
      image.onload = ()=>{clearTimeout(timer);resolve();};
      image.onerror = ()=>{clearTimeout(timer);reject(new Error('無法讀取商品第一張照片，請確認照片後重試'));};
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法處理照片，請重新整理後再試');
    context.fillStyle = '#ffffff';context.fillRect(0,0,SIZE,SIZE);
    const scale = Math.min(SIZE / image.naturalWidth,SIZE / image.naturalHeight);
    const width = image.naturalWidth * scale,height = image.naturalHeight * scale;
    context.drawImage(image,(SIZE-width)/2,(SIZE-height)/2,width,height);
    for (const quality of [.82,.65,.45,.25]) {
      const data = canvas.toDataURL('image/jpeg',quality);
      if (data.length <= 8023) return data;
    }
    throw new Error('商品縮圖過大，請重試');
  } finally {image.onload=image.onerror=null;image.src='';}
}

export async function exportProductExcel({request,download,onProgress = ()=>{}}) {
  const {products} = await request('admin/state');
  const thumbnails = [], pending = products.filter(p => p.images?.[0]);
  let next = 0,finished = 0,failure;
  const workers = Array.from({length:Math.min(4,pending.length)},async()=>{
    while (!failure && next < pending.length) {
      const product = pending[next++];
      try {thumbnails.push({productId:product.id,url:product.images[0],data:await thumbnail(product.images[0])});}
      catch(error){failure ||= error;throw error;}
      onProgress(++finished,pending.length);
    }
  });
  await Promise.allSettled(workers);
  if(failure)throw failure;
  await download('admin/products.xlsx','ccbaby-products.xlsx',{method:'POST',body:{thumbnails}});
}
