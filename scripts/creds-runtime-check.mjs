// 在 bun 与 node 下对照：我们的插件能否读写豆包凭据（DPAPI）。
// magpie 的插件宿主是 bun，若 bun 下 DPAPI 子进程或路径探测失败，
// 扫码登录就会"登录完没了"。
import * as m from '../lib/index.js'

console.log('runtime:', typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.version)
console.log('loadBrowserCredentials:', typeof m.loadBrowserCredentials)
console.log('saveBrowserCredentials:', typeof m.saveBrowserCredentials)
console.log('hasBrowserCredentials:', typeof m.hasBrowserCredentials)

try {
  const c = m.loadBrowserCredentials()
  console.log('load result:', c === undefined ? 'undefined' : JSON.stringify({ ok: c.ok, reason: c.reason, pairs: c.pairs?.size }))
} catch (e) {
  console.log('load THREW:', e?.message || e)
}

try {
  console.log('hasBrowserCredentials():', m.hasBrowserCredentials())
} catch (e) {
  console.log('has THREW:', e?.message || e)
}
