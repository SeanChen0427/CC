import { request, config, cloud, hasSession, lineLogin, finishLineLogin, browserLineLoginRequired } from './runtime.js?v=0.3.31';
import { art } from './product-art.js?v=0.3.31';
import { enterCustomerSite } from './entry.js?v=0.3.31';
import { imageForColor, photoIndexForColor } from './product-gallery.js?v=0.3.31';
import { mountGallery } from './gallery.js?v=0.3.31';
import { openProductVideo, closeProductVideo } from './product-video.js?v=0.3.31';
import { youtubeVideo } from './youtube.js?v=0.3.31';
import { mountBrowsingTracker } from './browsing.js?v=0.3.31';
import { categoryCounts as countCategories } from './product-categories.js?v=0.3.31';
import { lineContactMessage,lineContactURL } from './line-contact.js?v=0.3.31';
import { linkedProductId, productShareLink } from './product-link.js?v=0.3.31';
const $ = selector => document.querySelector(selector);
const money = n => 'NT$ ' + Number(n).toLocaleString('en-US');
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const paths = {
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0114 0v2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 3h8l4 4v14H4V3h4Z"/><path d="M8 11h8M8 15h8M8 7h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.bag}</svg>`;
const state = { products: [], campaign: null, user: null, profiles: [], category: '全部選物', search: '', limit: 24, cart: [], orders: [], selection: null, submitting: false, pending: null, contactDraft: null, lineConfigured: false, lineChannelId: null };
const modal = $('#modal');
if(globalThis.ResizeObserver)new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',$('#header').getBoundingClientRect().height+'px')).observe($('#header'));
let toastTimer, browsing=null, searchTimer;
function startBrowsing(){
  browsing?.dispose();
  browsing=mountBrowsingTracker(async(body,options)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{return await request('customer/browsing',{method:'POST',body,...options,signal:controller.signal});}
    finally{clearTimeout(timer);}
  });
}
function observe(action,detail={}){browsing?.action(action,detail);}
function observeVariant(action,variantId,quantity){const pair=getItem(variantId);if(pair)observe(action,{productId:pair.product.id,variantId,quantity});}
function browsingPrivacy(){setModal(`<div class="modal-copy"><h2>瀏覽紀錄說明</h2><p>登入後，本站會將瀏覽頁面、商品、前景停留與選購操作連結至你的會員身分，供店主了解選購需求與改善服務</p><p>紀錄僅供店主管理查看，保留最近 180 天，不記錄聯絡表單輸入、私人 LINE 對話或站外瀏覽，也不傳送至廣告平台</p><p>停留時間為估算，切到背景或閒置一分鐘後暫停；斷線、關閉瀏覽器等情況可能造成缺漏</p><p>如需詢問或刪除相關紀錄，請透過 LINE 聯絡店主</p><button class="primary-button" data-action="close">知道了</button></div>`,'modal-small');}

state.ready=false;
state.authRedirecting=false;

async function api(path, options = {}) {
  try { return await request(path, options); }
  catch(error) {
    if(error.status===401){
      browsing?.dispose();browsing=null;state.user=null;
      if(cloud)renderAuthGate('登入已到期，請重新使用 LINE 登入');else renderHeader();
    }
    throw error;
  }
}

function renderAuthGate(message, { loading=false, reload=false } = {}) {
  closeProductVideo();
  state.ready=false;
  document.body.classList.add('auth-pending');
  if(modal.open)modal.close();
  $('#header').innerHTML='';$('#bottom-nav').innerHTML='';
  const description=message||'登入後即可進入本期選物';
  $('#main').innerHTML=`<section class="auth-gate"><div class="eyebrow">CCBABY</div>${loading?'<video class="login-animation" data-login-animation data-src="./assets/login-run.mp4" poster="./assets/login-run-poster.webp" width="320" height="238" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>':''}<h1>${loading?'正在開啟 LINE 登入':'請先使用 LINE 登入'}</h1><p>${esc(description||'登入後即可進入本期選物')}</p>${!loading&&state.lineConfigured?`<button class="primary-button" data-action="line-login">${browserLineLoginRequired()?'在此瀏覽器重新登入 LINE':'使用 LINE 登入'}</button>`:''}${reload?'<button class="secondary-button" data-action="reload">重新載入</button>':''}</section>`;
}

async function startLineLogin(channelId=state.lineChannelId, { replace=false } = {}) {
  if(state.authRedirecting)return;
  state.authRedirecting=true;
  renderAuthGate('正在為你開啟 LINE 登入', {loading:true});
  try { await lineLogin(channelId,{replace}); }
  catch(error){state.authRedirecting=false;renderAuthGate(error.message);}
}

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

function photo(product, color, angle = 0) {
  const linked = imageForColor(product, color);
  if (linked) return linked;
  if (product.images?.length) return product.images[0];
  const tones = { '奶油白':'#d5c8ad', '燕麥棕':'#b69c81', '鼠尾草綠':'#a3b199' };
  return 'data:image/svg+xml,'+encodeURIComponent(art(product.kind, color ? tones[color] || product.tone : product.tone, angle));
}

function getItem(variantId) {
  for (const product of state.products) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

const cartKey = () => 'seoul-picks.cart.v1.' + (state.user?.id || 'guest');
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    state.cart = Array.isArray(saved) ? saved.filter(x => Number.isSafeInteger(x.variantId) && Number.isSafeInteger(x.quantity) && x.quantity > 0 && x.quantity <= 99 && Number.isSafeInteger(x.expectedPrice)) : [];
  } catch { state.cart = []; }
}
function saveCart() {
  localStorage.setItem(cartKey(), JSON.stringify(state.cart)); renderHeader();
}
const cartCount = () => state.cart.reduce((sum, i) => sum + i.quantity, 0);
const route = () => ['shop', 'cart', 'orders'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'shop';
const openForOrders = () => state.campaign?.status === 'open' && new Date(state.campaign.closesAt) > new Date();
const date = value => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month:'2-digit',day:'2-digit' }).format(new Date(value));
const categoryCounts = () => countCategories(state.categories,state.products);
function categories() {
  return [['全部選物', state.products.length], ...categoryCounts()].map(([name, count]) =>
    `<button class="category-option ${state.category === name ? 'active' : ''}" data-action="category" data-category="${esc(name)}"><span>${esc(name)}</span><small>${count}</small></button>`).join('');
}
function renderHeader() {
  const count = cartCount(), tab = route();
  $('#header').innerHTML = `<div class="header-inner">
    <a href="#shop" class="brand" aria-label="CCBABY 首頁"><span class="brand-mark">${icon('bag')}</span><span><span class="brand-name">CCBABY</span><span class="brand-sub">韓國・日常選物</span></span></a>
    <nav class="header-nav" aria-label="主要頁面"><a href="#shop" class="${tab === 'shop' ? 'active' : ''}">本期選物</a><a href="#orders" class="${tab === 'orders' ? 'active' : ''}">我的預購</a><a href="#shop" data-action="about">預購說明</a></nav>
    <div class="header-actions"><button class="login-button" data-action="${state.user ? 'account' : 'login'}">${icon('user')}<span>${state.user ? esc(state.user.display_name) : '會員登入'}</span></button><a href="#cart" class="cart-icon" aria-label="購物車 ${count} 件">${icon('bag')}${count ? `<span class="count">${count}</span>` : ''}</a></div>
  </div>${state.promotion?.text?`<div class="promotion-strip" aria-label="優惠資訊"><div>${esc(state.promotion.text)}</div></div>`:''}`;
  $('#bottom-nav').innerHTML = [['shop','grid','選購'],['cart','bag','購物車'],['orders','list','我的預購']].map(([id, image, name]) =>
    `<a href="#${id}" class="${tab === id ? 'active' : ''}">${icon(image)}<span>${name}</span>${id === 'cart' && count ? `<b class="count">${count}</b>` : ''}</a>`).join('');
}
const footer = () => `<footer class="footer"><strong>CCBABY</strong><span>韓國親自選物・為毛孩帶回喜歡</span><span>下單後 24 小時內付款・確認付款後安排採購</span>${config.demoMode ? '<span>本機示範版 / 原創商品示意圖</span>' : ''}<button class="text-button" type="button" data-action="about">預購與下單須知</button>${state.user?'<div class="browsing-note"><span>本站記錄瀏覽與選購操作，供店主了解需求</span><button class="text-button" type="button" data-action="browsing-privacy">了解紀錄用途</button></div>':''}</footer>`;

function renderShop() {
  const close = date(state.campaign.closesAt);
  $('#main').innerHTML = `<div class="page">
    <section class="hero"><div><div class="eyebrow">CURATED IN KOREA / CCBABY</div><h1>把喜歡的先收進清單</h1><div class="hero-description">一起挑選喜歡的韓國毛孩選物，由我們親飛韓國帶回</div><div class="hero-foot"><span class="pill"><i></i>${state.campaign.status==='draft' ? '本期選物準備中' : openForOrders() ? '本期預購開放中' : '本期已結單'}</span><span>${state.campaign.status==='draft' ? '開放時間將另行公告' : '預計 '+close+' 結單'}</span></div></div>
      ${state.products.length ? `<div class="hero-art" aria-hidden="true"><div class="hero-photo"><img src="${photo(state.products[0])}" alt=""></div><div class="hero-photo second"><img src="${photo(state.products[Math.min(2,state.products.length-1)])}" alt=""></div><div class="collection-seal">CURATED IN<b>SEOUL</b>WITH LOVE</div></div>` : `<div class="hero-art"><div class="coming-soon"><strong>CCBABY</strong><span>OUR NEXT LITTLE JOURNEY</span></div></div>`}
    </section>
    <div class="service-strip"><div>${icon('heart')}韓國親自挑選</div><div>${icon('bag')}下單後 24 小時內付款</div><div>${icon('box')}11/30 起陸續出貨</div></div>
    <div class="catalog-layout"><aside class="category-sidebar"><div class="sidebar-title">EXPLORE THE EDIT</div><div id="desktop-categories">${categories()}</div><div class="sidebar-note">一年一趟的韓國選物， 喜歡的款式先記下， 由我們親自為你尋找</div></aside>
      <section><div class="catalog-top"><div class="catalog-title"><h2 id="category-heading">${esc(state.category)}<small>${state.products.length} ITEMS</small></h2><p>一點質感，剛剛好的日常</p></div><label class="search" aria-label="搜尋商品">${icon('search')}<input id="search" placeholder="搜尋名稱或商品編號" value="${esc(state.search)}" autocomplete="off"></label></div>
      <div class="mobile-filter" id="mobile-categories">${[['全部選物',0],...categoryCounts()].map(([name]) => `<button data-action="category" data-category="${esc(name)}" class="${name === state.category ? 'active' : ''}">${esc(name)}</button>`).join('')}</div>
      <div class="product-grid" id="product-grid"></div><div id="load-more"></div></section>
    </div>${footer()}</div>`;
  $('#search').addEventListener('input', event => { state.search = event.target.value; state.limit = 24; renderGrid();clearTimeout(searchTimer);searchTimer=setTimeout(()=>observe('search',{results:state.products.filter(p=>(state.category==='全部選物'||p.category===state.category)&&(p.name+' '+p.code).toLocaleLowerCase().includes(state.search.toLocaleLowerCase())).length}),700); });
  renderGrid();
}

function renderGrid() {
  const emptyCategory=!state.search&&state.category!=='全部選物';
  const filtered = state.products.filter(p => (state.category === '全部選物' || p.category === state.category) &&
    (p.name + ' ' + p.code).toLocaleLowerCase().includes(state.search.toLocaleLowerCase()));
  $('#category-heading').innerHTML = `${esc(state.category)}<small>${filtered.length} ITEMS</small>`;
  $('#product-grid').innerHTML = filtered.slice(0, state.limit).map((p, index) => {
    const prices = p.variants.map(v => v.price), low = Math.min(...prices), high = Math.max(...prices);
    const price = low === high ? money(low) : money(low) + '–' + high.toLocaleString();
    return `<article class="product-card" style="animation-delay:${Math.min(index,8)*25}ms">
      <div class="product-photo" data-action="product" data-id="${p.id}" role="button" tabindex="0" aria-label="查看 ${esc(p.name)}"><img src="${photo(p)}" alt="${esc(p.name)}示意圖" loading="lazy">${p.badge ? `<span class="product-badge">${esc(p.badge)}</span>` : ''}</div>
      <div class="product-code">${esc(p.code)} / ${esc(p.category)}</div><h3>${esc(p.name)}</h3><div class="product-meta">${[...new Set(p.variants.map(v => v.color))].map(esc).join(' · ')}</div>
      <div class="product-bottom"><span class="product-price">${price}</span><div class="product-card-actions">${youtubeVideo(p.videoUrl)?`<button class="product-video-button" data-action="video" data-id="${p.id}" aria-label="觀看 ${esc(p.name)} 影片">${icon('play')}<span class="product-action-label">看介紹影片</span></button>`:''}<button class="primary-button product-order-button" data-action="product" data-id="${p.id}" aria-label="選擇 ${esc(p.name)} 規格">${icon('plus')}<span class="product-action-label">選規格預購</span></button></div></div></article>`;
  }).join('') || (!state.products.length ? `<div class="empty-state grid-empty">${icon('heart')}<h2>本期選物準備中</h2><p>我們正在整理這次的韓國選物， 開放預購時會再通知大家</p></div>` : `<div class="empty-state grid-empty">${icon('search')}<h2>${emptyCategory?'這個分類尚未上架商品':'找不到符合的商品'}</h2><p>${emptyCategory?'可以先看看其他分類的選物':'換個關鍵字，或試著搜尋商品編號'}</p><button class="secondary-button" data-action="clear-search">查看全部商品</button></div>`);
  $('#load-more').innerHTML = filtered.length > state.limit
    ? `<div class="load-more-wrap"><button class="secondary-button" data-action="more">繼續看看 ${icon('arrow')}</button><p class="collection-end">已顯示 ${Math.min(filtered.length,state.limit)} / ${filtered.length} 件選物</p></div>`
    : `<p class="collection-end">${filtered.length ? 'THE END OF THIS LITTLE EDIT' : ''}</p>`;
}

function setModal(content, className = '') {
  state.gallery?.dispose();state.gallery=null;
  modal.className = className;
  modal.innerHTML = `<button class="modal-close" data-action="close" aria-label="關閉">${icon('close')}</button>` + content;
  if (!modal.open) modal.showModal();
}

async function showLineContact({productId,orderId,orderCode}={}){
  if(!state.user){showLogin();return;}
  const data=await api('customer/line-contact',{method:'POST',body:{}});
  const product=state.products.find(p=>p.id===productId);
  const order=state.orders.find(o=>o.id===orderId)||(orderCode?{code:orderCode}:null);
  const context={product,order,productURL:product?productShareLink(config.customerURL,product,config.productPreviewURL):undefined};
  const message=lineContactMessage(data.contactCode,context),url=lineContactURL(data.contactCode,context);
  setModal(`<div class="modal-copy line-contact-copy"><div class="eyebrow">TALK WITH CCBABY</div><h2>${order?'和店主聯繫這份預購':'讓店主幫你一起選'}</h2><p>開啟 LINE 後，確認文字並按下傳送，我們就能在同一個聊天室回覆與確認後續進度</p><p>可先告訴我們毛孩的品種與性別，方便協助挑選；其他美妝代購也歡迎截圖私訊</p>${data.contactCode?`<div class="line-contact-code"><small>你的會員聯繫碼</small><strong>${esc(data.contactCode)}</strong></div>`:''}<p class="line-contact-message" id="line-contact-draft">${esc(message)}</p><button class="secondary-button" data-action="copy-line-contact">複製詢問文字</button><a class="primary-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">開啟 LINE，確認後傳送</a><p class="fine-print">如 LINE 提示加入好友，請先加入 CCBABY · 若電腦無法開啟，請在手機 LINE 加入 @445yxcey，再貼上詢問文字 · 網站預購請以送出成功為準；截圖下單請在官方帳號確認</p>${product?`<button class="secondary-button" data-action="product-return" data-id="${product.id}">返回商品</button>`:'<button class="secondary-button" data-action="close">返回選購</button>'}</div>`,'modal-small');
}

function showProduct(id, retain = false) {
  const product = state.products.find(p => p.id === id);
  if (!product) return toast('商品已更新，請重新選購');
  if (!retain || state.selection?.id !== id) state.selection = { id, color:'', size:'', quantity:1, photoIndex:0 };
  browsing?.view('product',id);
  const selected = state.selection;
  const colors = [...new Set(product.variants.map(v => v.color))];
  const sizes = [...new Set(product.variants.map(v => v.size))];
  if (colors.length === 1) selected.color = colors[0];
  if (sizes.length === 1) selected.size = sizes[0];
  const variant = product.variants.find(v => v.color === selected.color && v.size === selected.size);
  const images = product.images?.length ? product.images : [photo(product)];
  selected.photoIndex = Math.max(0, Math.min(selected.photoIndex || 0, images.length - 1));
  setModal(`<div class="product-dialog"><div class="product-gallery"><div class="product-main-image" role="region" aria-label="商品照片${images.length>1?'，可左右滑動':''}" tabindex="0">${images.map((url,i)=>`<button class="gallery-slide" type="button" data-action="zoom" data-index="${i}" aria-label="放大商品照片 ${i+1}"><img src="${esc(url)}" alt="${esc(product.name)} 照片 ${i+1}" draggable="false" ${i!==selected.photoIndex?'loading="lazy"':''}></button>`).join('')}</div><div class="gallery-progress" ${images.length<2?'hidden':''}><span>左右滑動</span><output class="gallery-count" aria-live="polite">${selected.photoIndex+1} / ${images.length}</output></div><div class="image-thumbs">${images.map((url,i) => `<button class="${i===selected.photoIndex?'selected':''}" data-action="photo" data-index="${i}" aria-label="查看商品照片 ${i+1}" aria-pressed="${i===selected.photoIndex}"><img src="${esc(url)}" alt="商品照片 ${i+1}"></button>`).join('')}</div></div>
    <div class="product-detail"><div class="eyebrow">${esc(product.code)} · ${esc(product.category)}</div><h2>${esc(product.name)}</h2><div class="detail-price-row"><div class="detail-price">${money(variant?.price ?? Math.min(...product.variants.map(v=>v.price)))}<small>預購參考售價</small></div>${youtubeVideo(product.videoUrl)?`<button class="product-video-button detail-video-button" data-action="video" data-id="${product.id}">${icon('play')}看介紹影片</button>`:''}</div>
    <p class="detail-description">${esc(product.description)}</p><button class="text-button line-contact-button" data-action="line-contact" data-product-id="${product.id}">用 LINE 詢問這款 →</button>
    <div class="option-label">顏色 <span>${esc(selected.color || '請選擇')}</span></div><div class="options">${colors.map(color => `<button class="option ${selected.color===color?'selected':''}" data-action="option" data-option="color" data-value="${esc(color)}">${esc(color)}</button>`).join('')}</div>
    <div class="option-label">尺寸／規格 ${['vest','coat'].includes(product.kind)?'<button class="text-button" data-action="size">尺寸參考</button>':''}</div><div class="options">${sizes.map(size => `<button class="option ${selected.size===size?'selected':''}" data-action="option" data-option="size" data-value="${esc(size)}">${esc(size)}</button>`).join('')}</div>
    <div class="product-cta"><div class="quantity"><button data-action="detail-qty" data-delta="-1" aria-label="減少數量">−</button><span>${selected.quantity}</span><button data-action="detail-qty" data-delta="1" aria-label="增加數量">＋</button></div><button class="primary-button" data-action="add" ${!variant || !openForOrders()?'disabled':''}>${openForOrders() ? variant?'加入購物車 '+money(variant.price*selected.quantity):'請先選擇完整規格':'本期已結單'}</button></div></div></div>`);
  state.gallery=mountGallery($('.product-gallery'),{index:selected.photoIndex,onChange:index=>{if(index!==selected.photoIndex)observe('photo');selected.photoIndex=index;}});
}

function showLogin() {
  if(!config.demoMode){
    setModal(`<div class="modal-copy"><div class="eyebrow">YOUR LITTLE COLLECTION</div><h2>使用 LINE 登入</h2><p>登入後即可送出、追加與查詢自己的預購</p>${state.lineConfigured ? `<button class="primary-button" data-action="line-login">使用 LINE 登入</button>` : `<div class="notice">LINE 登入準備中，開放預購時會再通知大家</div>`}</div>`,'modal-small');return;
  }
  setModal(`<div class="modal-copy"><div class="eyebrow">YOUR LITTLE COLLECTION</div><h2>登入會員</h2><p>登入後即可送出、追加與查詢自己的預購</p><div class="notice">本機測試尚未串接正式 LINE 登入，以下是互相隔離的示範會員，請選一位體驗</div><div class="profile-buttons">${state.profiles.map(user=>`<button class="profile-button" data-action="demo-login" data-id="${user.id}"><strong>${esc(user.name)}</strong><small>本機測試會員</small></button>`).join('')}</div><p class="fine-print">正式版將使用你的 LINE 身分登入，不需要另設網站密碼</p></div>`,'modal-small');
}

function renderCart() {
  if (!state.user) return renderLoginPage('登入後查看購物車');
  if (!state.cart.length) {
    $('#main').innerHTML = `<div class="sub-page"><div class="page-heading"><div><div class="eyebrow">YOUR LITTLE COLLECTION</div><h1>我的購物車</h1></div></div><div class="empty-state">${icon('bag')}<h2>購物車尚無商品</h2><p>挑幾件喜歡的選物， 這一趟讓我們一起帶回來</p><a href="#shop" class="primary-button">去看看本期選物 ${icon('arrow')}</a></div>${footer()}</div>`; return;
  }
  const total = state.cart.reduce((sum,i) => sum+i.expectedPrice*i.quantity,0);
  $('#main').innerHTML = `<div class="sub-page"><div class="page-heading"><div><div class="eyebrow">YOUR LITTLE COLLECTION</div><h1>我的購物車</h1><p>${cartCount()} 件小小喜歡，等我們一起帶回來</p></div><a href="#shop" class="secondary-button">繼續選購 ${icon('arrow')}</a></div>
    <div class="notice">${icon('clock')}<div>商品仍在購物車中，尚未正式預購， 送出後我們才會收到預購，請於下單後 24 小時內透過 LINE 完成付款，確認付款後才安排採購</div></div>
    <div class="cart-layout"><div class="cart-list">${state.cart.map(item=>{
      const pair=getItem(item.variantId), p=pair?.product;
      return `<div class="cart-row"><div class="cart-image">${p?`<img src="${photo(p,pair.variant.color)}" alt="${esc(p.name)}">`:''}</div><div class="cart-info"><div class="product-code">${esc(p?.code || '已更新商品')}</div><h3>${esc(p?.name || '此商品已停止預購')}</h3><p>${esc(pair?.variant.color)} / ${esc(pair?.variant.size)}</p><span class="cart-price">${money(item.expectedPrice)}</span></div><div class="cart-row-side"><div class="quantity"><button data-action="cart-qty" data-id="${item.variantId}" data-delta="-1" aria-label="減少商品數量">−</button><span>${item.quantity}</span><button data-action="cart-qty" data-id="${item.variantId}" data-delta="1" aria-label="增加商品數量">＋</button></div><button class="text-button" data-action="remove" data-id="${item.variantId}">移除</button></div></div>`;
    }).join('')}</div>
    <form class="order-summary" id="submit-form"><h2>預購確認</h2><div class="summary-line"><span>商品件數</span><span>${cartCount()} 件</span></div><div class="summary-line"><span>付款方式</span><span>下單後 24 小時內付款</span></div><div class="summary-total"><span>預估商品小計</span><strong>${money(total)}</strong></div><label class="form-field">聯絡姓名<input name="name" required maxlength="40" autocomplete="name" value="${esc(state.user.name)}" placeholder="方便我們聯絡你的姓名"></label><label class="form-field">手機號碼<input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(state.user.phone)}" placeholder="09 開頭的手機號碼"></label><div class="error-message" id="submit-error" role="alert"></div><button class="primary-button" type="submit" ${!openForOrders()?'disabled':''}>${openForOrders()?'送出預購':'本期已結單'} ${icon('arrow')}</button><p class="fine-print">下單即同意預購規則，請先自行確認尺寸，恕不接受退換貨；喊單後請勿棄單或失聯，違者將備案處理</p><button class="text-button" type="button" data-action="about">查看完整預購與下單須知 →</button><p class="fine-print">缺貨可選擇退款或更換款式，運費與收件資訊於 LINE 另行確認</p><button class="text-button" type="button" data-action="line-contact">選購有問題，用 LINE 找店主 →</button></form></div>${footer()}</div>`;
  $('#submit-form').addEventListener('submit', submitOrder);
  if (state.contactDraft) {
    $('#submit-form').elements.namedItem('name').value = state.contactDraft.name;
    $('#submit-form').elements.namedItem('phone').value = state.contactDraft.phone;
  }
  $('#submit-form').addEventListener('input', event => {
    const form = event.currentTarget;
    state.contactDraft = { name: form.elements.namedItem('name').value, phone: form.elements.namedItem('phone').value };
  });
}

async function submitOrder(event) {
  event.preventDefault();
  if(state.submitting) return;
  const form = event.currentTarget;
  const payload = { name:form.elements.namedItem('name').value,phone:form.elements.namedItem('phone').value,items:state.cart.map(i=>({...i})) };
  const signature = JSON.stringify(payload);
  if(state.pending?.signature!==signature) state.pending={signature,requestId:crypto.randomUUID()};
  observe('submit_attempt');
  let saved=false;
  state.submitting=true; const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='正在送出預購…';
  try {
    const result=await api('customer/preorders',{method:'POST',body:{...payload,requestId:state.pending.requestId}});
    saved=true;observe('submit_success',{quantity:result.added});
    state.cart=[];saveCart();state.pending=null;state.contactDraft=null;
    state.user=(await api('me')).user;renderCart();
    setModal(`<div class="modal-copy"><div class="success-mark">${icon('check')}</div><div class="eyebrow">SAVED FOR YOUR NEXT JOURNEY</div><h2>預購已送出</h2><p>已記下這次的 ${result.added} 件選物，請於下單後 24 小時內透過 LINE 完成付款</p><div class="success-code">${esc(result.code)}</div><p>確認付款後才安排採購，依付款順序寄出，預計 11/30 起陸續出貨；缺貨可選擇退款或更換款式</p><button class="primary-button" data-action="line-contact" data-order-id="${result.orderId}" data-order-code="${esc(result.code)}">用 LINE 確認付款與預購</button><p class="fine-print">有問題可直接在官方帳號留言，預購明細也能隨時在網站查看</p><button class="secondary-button" data-action="view-orders">查看我的預購 ${icon('arrow')}</button></div>`,'modal-small');
  } catch(error) { if(!saved)observe('submit_failure');if ($('#submit-error')) $('#submit-error').textContent=error.message; else toast(error.message);button.disabled=false;button.innerHTML='重新送出預購 '+icon('arrow'); }
  finally {state.submitting=false;}
}

function renderLoginPage(title) {
  $('#main').innerHTML=`<div class="sub-page"><div class="empty-state">${icon('user')}<h2>${esc(title)}</h2><p>你的選物與預購清單， 會好好保存在自己的會員帳下</p><button class="primary-button" data-action="login">${config.demoMode?'以本機測試會員登入':'使用 LINE 登入'} ${icon('arrow')}</button></div>${footer()}</div>`;
}

async function renderOrders() {
  if(!state.user) return renderLoginPage('登入後查看預購');
  $('#main').innerHTML='<div class="loading">正在找回你的選物清單…</div>';
  try {
    const data=await api('customer/orders');state.orders=data.orders;state.campaign=data.campaign;
    if(route()!=='orders')return;
    const orders=data.orders.filter(o=>o.quantity>0);
    const labels={open:'預購已收到',closed:'已結單',purchasing:'韓國採購中',arrived:'商品已到台',archived:'本期已完成'};
    $('#main').innerHTML=`<div class="sub-page"><div class="page-heading"><div><div class="eyebrow">SAVED WITH LOVE</div><h1>我的預購</h1><p>喜歡的選物，和這一趟的每個進度</p></div><a href="#shop" class="secondary-button">繼續追加 ${icon('plus')}</a></div>
      ${orders.length?orders.map(o=>`<article class="order-card"><div class="order-card-head"><div><div class="order-code">${esc(o.code)}</div><div class="order-time">${date(o.created_at)} 建立 · 最近更新 ${date(o.updated_at)}</div></div><span class="status-chip">${labels[state.campaign.status]||'已預購'}</span></div>
      ${o.items.map(i=>`<div class="order-item"><div>${esc(i.product_name)}<small>${esc(i.product_code)} · ${esc(i.color)} / ${esc(i.size)} · ${i.quantity} 件</small><small>${i.bought?`已分配買到 ${i.bought} 件`:'等待採購／分配'}${i.shortage?` · 確認缺貨 ${i.shortage} 件`:''}</small></div><div class="order-item-side"><span>${money(i.price*i.quantity)}</span>${openForOrders()?` <button class="text-button" data-action="edit-item" data-id="${i.id}">修改數量</button>`:''}</div></div>`).join('')}<div class="order-card-foot"><span>共 ${o.quantity} 件・預估商品小計</span><strong>${money(o.total)}</strong></div><div class="order-line-contact"><button class="secondary-button" data-action="line-contact" data-order-id="${o.id}" data-order-code="${esc(o.code)}">用 LINE 確認付款與預購</button></div></article>`).join(''):`<div class="empty-state">${icon('list')}<h2>尚未送出預購</h2><p>你還沒有送出本期預購，去挑幾件喜歡的吧</p><a href="#shop" class="primary-button">查看本期選物 ${icon('arrow')}</a></div>`}
      <div class="contact-card"><div><h3>聯絡與收件資料</h3><p>${esc(state.user.name||'聯絡姓名尚未填寫')}${state.user.phone?' · '+esc(state.user.phone):''}</p><p>${esc(state.user.delivery||'收件資訊可以稍後再補齊')}</p></div><button class="text-button" data-action="profile">編輯資料</button></div><p class="fine-print">下單後 24 小時內須完成付款，確認付款後才安排採購；依付款順序寄出，預計 11/30 起陸續出貨，缺貨可選擇退款或更換款式。付款、尺寸或商品問題，請直接在 LINE 官方帳號留言</p>${footer()}</div>`;
  }catch(error){if(cloud&&!state.user)return;$('#main').innerHTML=`<div class="empty-state"><h2>暫時無法讀取預購</h2><p>${esc(error.message)}</p><button class="secondary-button" data-action="retry">再試一次</button></div>`;}
}

function render() {
  if(cloud&&(!state.ready||!state.user))return;
  browsing?.view(route());
  renderHeader();
  if(route()==='cart')renderCart();
  else if(route()==='orders')renderOrders();
  else renderShop();
}

function openLinkedProduct() {
  if(!state.ready||(cloud&&!state.user))return;
  const id=linkedProductId(location.hash);
  if(id===null)return;
  if(state.products.some(p=>p.id===id)){showProduct(id);return;}
  history.replaceState(null,'',location.pathname+location.search+'#shop');
  toast('商品目前無法查看，請看看其他選物');
}

document.addEventListener('click', async event => {
  const target=event.target.closest('[data-action]');
  if(!target)return;
  const action=target.dataset.action;
  try {
    if(action==='browsing-privacy'){browsingPrivacy();return;}
    if(action==='line-contact'){
      if(target.disabled)return;target.disabled=true;
      try{await showLineContact({productId:Number(target.dataset.productId)||undefined,orderId:Number(target.dataset.orderId)||undefined,orderCode:target.dataset.orderCode});}
      finally{target.disabled=false;}return;
    }
    if(action==='copy-line-contact'){try{await navigator.clipboard.writeText($('#line-contact-draft').textContent);toast('詢問文字已複製');}catch{toast('請長按上方詢問文字後複製');}return;}
    if(action==='product-return'){showProduct(Number(target.dataset.id),true);return;}
    if(action==='close'){modal.close();return;}
    if(action==='video'){
      const product=state.products.find(p=>p.id===Number(target.dataset.id));
      if(!product||!openProductVideo(product,{returnLabel:modal.open?'返回商品':'返回選購'}))toast('影片連結已更新，請重新載入商品');
      return;
    }
    if(action==='category'){
      state.category=target.dataset.category;observe('category',{category:state.category});state.limit=24;modal.close();renderShop();return;
    }
    if(action==='product'){showProduct(Number(target.dataset.id));return;}
    if(action==='clear-search'){state.search='';state.category='全部選物';state.limit=24;renderShop();return;}
    if(action==='more'){observe('more');state.limit+=24;renderGrid();return;}
    if(action==='photo'){state.gallery?.select(Number(target.dataset.index));return;}
    if(action==='option'){
      observe(target.dataset.option==='color'?'select_color':'select_size',{option:target.dataset.value});
      state.selection[target.dataset.option]=target.dataset.value;
      if(target.dataset.option==='color'){
        const product=state.products.find(p=>p.id===state.selection.id);
        state.selection.photoIndex=photoIndexForColor(product,target.dataset.value,state.selection.photoIndex);
      }
      showProduct(state.selection.id,true);return;
    }
    if(action==='detail-qty'){observe('detail_quantity');state.selection.quantity=Math.min(99,Math.max(1,state.selection.quantity+Number(target.dataset.delta)));showProduct(state.selection.id,true);return;}
    if(action==='login'){showLogin();return;}
    if(action==='line-login'){await startLineLogin();return;}
    if(action==='reload'){location.reload();return;}
    if(action==='demo-login'){
      target.disabled=true;
      const data=await api('customer/login',{method:'POST',body:{profile:target.dataset.id}});
      state.user=data.user;state.contactDraft=null;loadCart();startBrowsing();modal.close();render();void browsing?.flush();
      toast('已使用「'+state.user.display_name+'」測試登入');return;
    }
    if(action==='account'){observe('account');
      setModal(`<div class="modal-copy"><div class="eyebrow">YOUR ACCOUNT</div><h2>你好，${esc(state.user.display_name)}</h2><p>${config.demoMode?'目前為本機測試會員':'已使用 LINE 身分登入'}你的預購與購物車會分開保存</p><button class="text-button" type="button" data-action="browsing-privacy">瀏覽紀錄與用途</button><div class="form-actions"><button class="secondary-button" data-action="logout">登出</button><button class="primary-button" data-action="view-orders">我的預購</button></div></div>`,'modal-small');return;
    }
    if(action==='logout'){observe('logout');void browsing?.flush({keepalive:true});browsing?.dispose();browsing=null;await api('logout',{method:'POST',body:{}});state.user=null;state.cart=[];state.contactDraft=null;modal.close();if(cloud)renderAuthGate('你已登出，請使用 LINE 登入後繼續');else render();return;}
    if(action==='add'){
      if(state.submitting)return;
      if(!state.user){showLogin();return;}
      const {id,color,size,quantity}=state.selection;
      const product=state.products.find(p=>p.id===id),variant=product.variants.find(v=>v.color===color&&v.size===size);
      if(!variant)return;
      const existing=state.cart.find(i=>i.variantId===variant.id);
      if(existing){
        if(existing.quantity+quantity>99)throw new Error('同一規格最多先預購 99 件');
        if(existing.expectedPrice!==variant.price)throw new Error('商品價格已變更，請先移除舊購物車品項再選購');
        existing.quantity+=quantity;
      }else state.cart.push({variantId:variant.id,quantity,expectedPrice:variant.price});
      observeVariant('cart_add',variant.id,quantity);saveCart();modal.close();toast('已放進購物車，記得送出才算預購完成');return;
    }
    if(action==='cart-qty'){
      if(state.submitting)return;
      const item=state.cart.find(i=>i.variantId===Number(target.dataset.id));
      item.quantity=Math.min(99,Math.max(1,item.quantity+Number(target.dataset.delta)));observeVariant('cart_quantity',item.variantId,item.quantity);saveCart();renderCart();return;
    }
    if(action==='remove'){if(state.submitting)return;observeVariant('cart_remove',Number(target.dataset.id),0);state.cart=state.cart.filter(i=>i.variantId!==Number(target.dataset.id));saveCart();renderCart();return;}
    if(action==='view-orders'){modal.close();if(route()==='orders')renderOrders();else location.hash='orders';return;}
    if(action==='retry'){render();return;}
    if(action==='about'){observe('about');
      event.preventDefault();setModal(`<div class="modal-copy"><div class="eyebrow">A LITTLE NOTE</div><h2>預購說明</h2><p>歡迎加入 CCBABY 🤍 一起挑選喜歡的韓國毛孩選物</p><h3>韓國連線預購</h3><ol class="preorder-rules"><li>已上架商品可先預購，確認顏色、尺寸與數量後，由購物車送出，我們將親飛韓國帶回</li><li>連線期間會有限時動態連線，可截圖至 LINE 官方帳號私訊下單；其他美妝代購也歡迎截圖詢問</li><li>下單後 24 小時內須完成付款，才會安排採購，依付款順序寄出；收款資料與總額請在 LINE 確認</li><li>韓國商品可能斷貨，可選擇退款或更換其他款式，建議提前準備備案</li><li>預計 11/30 起陸續出貨</li></ol><h3>下單前請務必確認</h3><ol class="preorder-rules"><li>韓國款式版型不同，請勿直接比照以往購買尺寸</li><li>尺寸請自行確認後再下單，恕不接受退換貨</li><li>下單即同意以上規則，喊單後請勿棄單或失聯，違者將備案處理</li></ol><p>可先提供毛孩品種與性別，方便我們協助挑選；尺寸或商品有問題，直接在 LINE 官方帳號留言就好</p><div class="notice">本期結單：${date(state.campaign.closesAt)}，結單前可追加與調整；結單後如需異動，請聯絡店主</div><button class="primary-button" data-action="close">知道了</button></div>`,'modal-small');return;
    }
    if(action==='zoom'){observe('zoom');
      const p=state.products.find(p=>p.id===state.selection.id);
      if(target.dataset.index!==undefined)state.selection.photoIndex=Number(target.dataset.index);
      setModal(`<img class="zoom-image" src="${esc(p.images?.[state.selection.photoIndex] || photo(p))}" alt="${esc(p.name)}放大圖"><button class="secondary-button" data-action="back-product" style="margin:15px">返回商品</button>`);return;
    }
    if(action==='back-product'){showProduct(state.selection.id,true);return;}
    if(action==='size'&&!config.demoMode){observe('size_guide');setModal(`<div class="modal-copy"><div class="eyebrow">SIZE GUIDE</div><h2>尺寸選擇</h2><p>韓國款式版型不同，請勿直接比照以往購買尺寸，請依各款商品說明自行確認後再下單，恕不接受退換貨</p><p>可透過 LINE 提供毛孩品種與性別，讓我們協助挑選；尺寸或商品有問題，直接在官方帳號留言就好</p><button class="secondary-button" data-action="back-product">返回商品</button></div>`,'modal-small');return;}
    if(action==='size'){observe('size_guide');
      setModal(`<div class="modal-copy"><div class="eyebrow">SIZE REFERENCE / CM</div><h2>尺寸選擇</h2><p>本機示範尺寸表，正式上架時請替換為各款實際尺寸</p><table class="size-table"><thead><tr><th>尺寸</th><th>胸圍</th><th>背長</th></tr></thead><tbody><tr><td>S</td><td>33</td><td>23</td></tr><tr><td>M</td><td>39</td><td>28</td></tr><tr><td>L</td><td>43</td><td>30</td></tr><tr><td>XL</td><td>48</td><td>35</td></tr></tbody></table><button class="secondary-button" data-action="back-product">返回商品</button></div>`,'modal-small');return;
    }
    if(action==='profile'){
      setModal(`<form id="profile-form" class="modal-copy"><div class="eyebrow">YOUR DETAILS</div><h2>聯絡與收件資料</h2><label class="form-field">聯絡姓名<input name="name" required value="${esc(state.user.name)}"></label><label class="form-field">手機號碼<input name="phone" required inputmode="tel" value="${esc(state.user.phone)}"></label><label class="form-field">收件地址／取貨備註（可稍後填）<textarea name="delivery">${esc(state.user.delivery)}</textarea></label><div class="error-message" id="profile-error" role="alert"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close">取消</button><button class="primary-button">儲存資料</button></div></form>`,'modal-small');
      $('#profile-form').addEventListener('submit',async e=>{
        e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
        try{await api('customer/profile',{method:'PATCH',body:data});observe('profile_saved');state.user=(await api('me')).user;modal.close();render();toast('資料已儲存');}
        catch(error){$('#profile-error').textContent=error.message;}
      });return;
    }
    if(action==='edit-item'){
      const item=state.orders.flatMap(o=>o.items).find(i=>i.id===Number(target.dataset.id));
      setModal(`<form id="item-form" class="modal-copy"><div class="eyebrow">EDIT PREORDER</div><h2>調整預購數量</h2><p>${esc(item.product_name)} ${esc(item.color)} / ${esc(item.size)}</p><label class="form-field">數量（填 0 取消此品項）<input name="quantity" type="number" min="0" max="999" required value="${item.quantity}"></label><div class="error-message" id="item-error" role="alert"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close">返回</button><button class="primary-button">儲存變更</button></div></form>`,'modal-small');
      $('#item-form').addEventListener('submit',async e=>{
        e.preventDefault();try{await api('customer/items/'+item.id,{method:'PATCH',body:{quantity:Number(e.currentTarget.quantity.value)}});observe('order_quantity',{quantity:Number(e.currentTarget.quantity.value)});modal.close();renderOrders();toast('預購數量已更新');}
        catch(error){$('#item-error').textContent=error.message;}
      });return;
    }
  }catch(error){toast(error.message);target.disabled=false;}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target.matches('.product-photo'))showProduct(Number(event.target.dataset.id));
});
modal.addEventListener('close',()=>{
  if(modal.open)return;
  closeProductVideo();
  if(state.ready&&linkedProductId(location.hash)!==null)history.replaceState(null,'',location.pathname+location.search+'#shop');
  browsing?.view(route());state.gallery?.dispose();state.gallery=null;
});
modal.addEventListener('click',event=>{if(event.target===modal){const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)modal.close();}});
window.addEventListener('hashchange',()=>{closeProductVideo();modal.close();render();openLinkedProduct();window.scrollTo(0,0);});
window.addEventListener('pageshow',event=>{
  if(event.persisted&&cloud&&!state.user){state.authRedirecting=false;renderAuthGate('請使用 LINE 登入後繼續');}
});

try {
  const query=new URLSearchParams(location.search);
  await enterCustomerSite({
    cloud,hasSession,returningFromLine:query.has('code')||query.has('error'),
    finishLogin:finishLineLogin,request:api,
    showGate:(auth,message)=>{state.lineConfigured=auth.lineConfigured;state.lineChannelId=auth.lineChannelId;renderAuthGate(message);},
    login:channelId=>startLineLogin(channelId,{replace:true}),
    ready:(catalog,me)=>{
      state.products=catalog.products;state.categories=catalog.categories||[];state.campaign=catalog.campaign;state.promotion=catalog.promotion;state.user=me.user;state.profiles=me.profiles||[];state.lineConfigured=catalog.lineConfigured;state.lineChannelId=catalog.lineChannelId;
      if(state.user)startBrowsing();state.ready=true;document.body.classList.remove('auth-pending');loadCart();render();openLinkedProduct();void browsing?.flush();
    },
  });
}catch(error){
  renderAuthGate(error.message,{reload:true});
}
