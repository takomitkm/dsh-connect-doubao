// 定位 pi-entry 加载卡点：逐步 import + 带超时的 registerProvider。
// 每个步骤打日志，任何一步挂起都能看出卡在哪。
const LOG = (s) => console.log(new Date().toISOString().slice(11, 19), s)
const timeout = (ms, label) => {
  let t
  const p = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`TIMEOUT at ${label} (${ms}ms)`)), ms) })
  return { p, cancel: () => clearTimeout(t) }
}

LOG('1. import pi-entry.js (built)...')
const mod = await import(new URL('../lib/pi-entry.js', import.meta.url).href)
LOG('2. default export:', typeof mod.default)
const ext = mod.default

LOG('3. creating fake pi with registerProvider...')
const registrations = []
const fakePi = { registerProvider: (...args) => registrations.push(args) }

LOG('4. calling extension (this starts the shim + waits baseUrl)...')
const { p, cancel } = timeout(15000, 'extension call')
try {
  await Promise.race([ext(fakePi), p])
  cancel()
  LOG('5. extension returned. registrations:', registrations.length)
  for (const [a, b] of registrations) {
    LOG('   provider:', typeof a === 'string' ? a : a?.id, '| config keys:', b ? Object.keys(b).join(',') : '(none)')
  }
} catch (e) {
  cancel()
  LOG('ERROR:', e?.message || e)
}
