// Optional decoration: authentication never imports, calls or awaits this module.
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const failed=new WeakSet();
let current=null,timer=null;

function stop(video){
  video.pause();
  if(video.hasAttribute('src')){video.removeAttribute('src');video.load();}
}

function sync(){
  clearTimeout(timer);timer=null;
  const next=!document.hidden&&!reducedMotion.matches&&document.body.classList.contains('auth-pending')
    ?document.querySelector('video[data-login-animation]'):null;
  if(current!==next){if(current)stop(current);current=next;}
  if(!next||failed.has(next)||next.hasAttribute('src'))return;
  // Delay only the media request; fast logins can finish before it starts.
  timer=setTimeout(()=>{
    timer=null;
    if(current!==next||!next.isConnected||document.hidden||reducedMotion.matches||!document.body.classList.contains('auth-pending'))return;
    next.addEventListener('error',()=>{failed.add(next);stop(next);},{once:true});
    next.muted=true;next.autoplay=true;next.src=next.dataset.src;
    try{next.play()?.catch(()=>{});}catch{stop(next);}
  },150);
}

const observer=new MutationObserver(sync);
observer.observe(document.body,{attributes:true,attributeFilter:['class']});
observer.observe(document.querySelector('#main'),{childList:true});
document.addEventListener('visibilitychange',sync);
reducedMotion.addEventListener('change',sync);
window.addEventListener('pageshow',sync);
window.addEventListener('pagehide',()=>{clearTimeout(timer);if(current)stop(current);current=null;});
sync();
