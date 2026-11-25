/**
 * 一个极薄的 fetch 封装（不引 axios）。两件事：
 * 1) 四端统一用 Sa-Token 登录态（X-Auth-Token），不再有免登链接。
 * 2) 拆 {code,msg,data} 信封：code!=0 时把后端那句中文原话抛出去，界面直接显示，
 *    因为业务拦截（货款锁定、垫付未追回）全靠这句话告诉老板为什么不行。
 */
const AUTH_KEY = 'paotui.auth.token';

let authToken = localStorage.getItem(AUTH_KEY) || '';

export function setAuthToken(v) {
  authToken = v || '';
  if (v) localStorage.setItem(AUTH_KEY, v);
  else localStorage.removeItem(AUTH_KEY);
}
export function getAuthToken() {
  return authToken;
}

function authHeader(path) {
  if (/^\/api\/(admin|auth|m|r|c)\//.test(path)) {
    return authToken ? { 'X-Auth-Token': authToken } : {};
  }
  return {};
}

function qs(query) {
  if (!query) return '';
  const p = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v));
  return p.length ? '?' + p.join('&') : '';
}

async function request(method, path, opt = {}) {
  const headers = { ...authHeader(path) };
  let body;
  if (opt.form) {
    body = opt.form;
  } else if (opt.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opt.body);
  }
  let res;
  try {
    res = await fetch(path + qs(opt.query), { method, headers, body });
  } catch (e) {
    throw new Error('连不上服务，请确认后端已启动');
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error('服务返回的不是 JSON（HTTP ' + res.status + '）');
  }
  if (json.code !== 0) {
    const err = new Error(json.msg || '请求失败（' + json.code + '）');
    err.code = json.code;
    throw err;
  }
  return json.data;
}

export const http = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body, query) => request('POST', path, { body, query }),
  put: (path, body, query) => request('PUT', path, { body, query }),
  del: (path, query) => request('DELETE', path, { query }),
  /** 照片上传：字段名固定 file，bizType/bizId 走 query，返回 {id,url} */
  upload: (path, file, query) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', path, { form: fd, query });
  },
};
