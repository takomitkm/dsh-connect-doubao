import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoubaoShim, type DoubaoShim } from '../src/doubao-shim.ts'
import { REQUIRED_COOKIE_NAMES, type DoubaoCredentials } from '../src/doubao-auth.ts'
import { invalidateDiscovery } from '../src/doubao-discovery.ts'
import { invalidateQuotaCache } from '../src/doubao-quota.ts'

// Same contract as the other HTTP-level suites: no local Doubao login needed.
vi.mock('../src/doubao-auth.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/doubao-auth.ts')>()
  const fake: DoubaoCredentials = {
    ok: true,
    header: actual.REQUIRED_COOKIE_NAMES.map((name) => `${name}=test`).join('; '),
    pairs: new Map(actual.REQUIRED_COOKIE_NAMES.map((name) => [name, 'test'])),
  }
  return { ...actual, loadDoubaoCredentials: () => fake }
})

/** Measured upstream boundary (#17): 262,144 OK, 262,145 rejected. */
const LIMIT = 262_144

let shims: DoubaoShim[] = []

beforeEach(() => {
  invalidateDiscovery()
  invalidateQuotaCache()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  for (const shim of shims.splice(0)) {
    await shim.close()
  }
})

/**
 * Route loopback traffic to the shim itself and record every non-loopback
 * call, so a test can prove the oversized prompt never left the process.
 */
function stubUpstream(handler?: (url: string, init?: RequestInit) => Response): string[] {
  const realFetch = globalThis.fetch
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init)
      calls.push(url)
      if (url.includes('/quota/summary/')) {
        return new Response(JSON.stringify({ data: { window_limit_section: { usage_exhausted: false } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (handler !== undefined) return handler(url, init)
      // A turn that fails fast and loudly: the test only cares about WHICH
      // error came back, not about a successful stream.
      return new Response('upstream boom', { status: 500 })
    }),
  )
  return calls
}

async function postChat(shim: DoubaoShim, content: string): Promise<Response> {
  const base = await shim.baseUrl()
  return fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${shim.token()}`,
    },
    body: JSON.stringify({ model: '0', stream: false, messages: [{ role: 'user', content }] }),
  })
}

describe('prompt character limit (#17)', () => {
  it('refuses an oversized prompt locally, without touching the upstream', async () => {
    const calls = stubUpstream()
    const shim = createDoubaoShim({ toolEmulation: () => false })
    shims.push(shim)

    const response = await postChat(shim, 'x'.repeat(LIMIT + 1))

    expect(response.status).toBe(400)
    expect(response.headers.get('x-should-retry')).toBe('false')
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe('PROMPT_TOO_LONG')
    expect(body.error?.message).toContain(String(LIMIT))
    // Nothing was sent: an upstream attempt here would come back as 710020202,
    // which the continuation fallback would misread as a dead session.
    expect(calls.filter((url) => url.includes('/chat/completion'))).toHaveLength(0)
  })

  it('does not refuse a prompt at the boundary itself', async () => {
    stubUpstream()
    const shim = createDoubaoShim({ toolEmulation: () => false })
    shims.push(shim)

    const response = await postChat(shim, 'x'.repeat(LIMIT))

    // The upstream is stubbed to fail, so the status is an upstream one; what
    // matters is that the local guard did NOT fire.
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string } }
    expect(body.error?.code).not.toBe('PROMPT_TOO_LONG')
  })

  it('keeps the declared context window below what the character limit allows', async () => {
    const { DOUBAO_CONTEXT_WINDOW } = await import('../src/doubao-catalog.ts')
    // A conservative sanity check: the declaration must leave headroom, since
    // tokens and characters do not convert 1:1.
    expect(DOUBAO_CONTEXT_WINDOW).toBeLessThan(LIMIT)
  })
})
