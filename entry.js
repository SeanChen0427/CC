// Keep the product page and its data behind a verified customer session.
export async function enterCustomerSite({ cloud, hasSession, returningFromLine, finishLogin, request, showGate, login, ready }) {
  let callbackError, startup;
  try { startup = await finishLogin(); } catch (error) { callbackError = error; }
  if (cloud && callbackError) {
    const auth = await request('customer/line/config');
    showGate(auth, callbackError.message);
    return 'blocked';
  }
  if (cloud) {
    if (!startup && hasSession()) {
      try { startup = await request('customer/bootstrap'); }
      catch (error) {
        // Keep older backends usable during rollout or a rollback.
        if (error.status === 404) {
          const me = await request('me');
          if (me.authenticated && me.user) startup = { me, catalog: await request('catalog') };
        } else if (error.status !== 401) throw error;
      }
    }
    if (startup?.me?.authenticated && startup.me.user && startup.catalog) {
      ready(startup.catalog, startup.me);
      return 'ready';
    }
    const auth = await request('customer/line/config');
    showGate(auth, !auth.lineConfigured ? 'LINE 登入準備中，請稍後再試' : returningFromLine ? '登入尚未完成，請重新使用 LINE 登入' : '正在開啟 LINE 登入');
    if (!auth.lineConfigured) return 'unavailable';
    if (returningFromLine) return 'blocked';
    await login(auth.lineChannelId);
    return 'redirected';
  }
  const me = await request('me');
  const catalog = await request('catalog');
  ready(catalog, me);
  return 'ready';
}
