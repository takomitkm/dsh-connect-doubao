// 复刻 magpie internal/plugin/pi.js 的 methods() 判定，验证我们的 provider 会推什么登录方法。
// 原文：const a = prov()?.auth ?? {}
//       if (a.oauth) push oauth method
//       if (a.apiKey || !a.oauth) push { type:"api", label:"API key" }
const mod = await import(new URL('../lib/pi-entry.js', import.meta.url).href)
const regs = []
const pi = { registerProvider: (...a) => regs.push(a) }
await mod.default(pi)
const provider = regs[0]?.[0]
const a = provider?.auth ?? {}
console.log('auth keys:', Object.keys(a))
const out = []
if (a.oauth) out.push({ type: 'oauth', label: a.oauth.loginLabel ?? `Sign in with ${a.oauth.name}` })
if (a.apiKey || !a.oauth) out.push({ type: 'api', label: 'API key' })
console.log('magpie 会推出的登录方法:', JSON.stringify(out, null, 1))
console.log('会弹 API key 框吗:', out.some(m => m.type === 'api') ? 'YES(有问题)' : 'NO(正确)')
