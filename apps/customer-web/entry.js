// Keep the product page and its data behind a verified customer session.
export async function enterCustomerSite({ cloud, returningFromLine, finishLogin, request, showGate, login, ready }) {
  let callbackError;
  try { await finishLogin(); } catch (error) { callbackError = error; }
  if (cloud && callbackError) {
    const auth = await request('customer/line/config');
    showGate(auth, callbackError.message);
    return 'blocked';
  }
  const me = await request('me');
  if (cloud && (!me.authenticated || !me.user)) {
    const auth = await request('customer/line/config');
    showGate(auth, !auth.lineConfigured ? 'LINE 登入準備中，請稍後再試' : returningFromLine ? '登入尚未完成，請重新使用 LINE 登入' : '正在開啟 LINE 登入');
    if (!auth.lineConfigured) return 'unavailable';
    if (returningFromLine) return 'blocked';
    await login(auth.lineChannelId);
    return 'redirected';
  }
  const catalog = await request('catalog');
  ready(catalog, me);
  return 'ready';
}
