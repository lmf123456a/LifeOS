/* LifeOS API 客户端 */
async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (!(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
  }
  // 会话令牌：由启动器注入 URL，防本机其他进程直连
  const token = sessionStorage.getItem('lifeos_token') || '';
  if (token) opts.headers['X-LifeOS-Token'] = token;
  // 注意：FormData 不能 JSON 序列化（会变成 {}），必须原样发送
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error('无法连接本地服务，请确认 LifeOS 已启动');
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}
