/**
 * Doubao pi extension entrypoint — the pi-package half of this plugin.
 *
 * The DSH half (src/index.ts) hands a pi-ai `Provider` to DSH through
 * `dsh-llm-pi-ai`'s `PiAiAdapter`. This half does the inverse: it registers
 * the same Doubao provider into pi's own `ModelRegistry`, so the package runs
 * as a `pi-package` under pi AND under magpie (magpie's `internal/plugin/pi.js`
 * loads pi extensions and turns each `registerProvider` into its hooks).
 *
 * The provider is built the same way `doubao-adapter.ts` builds its pi-ai
 * Provider — `createProvider` from `@earendil-works/pi-ai` — and handed to
 * `pi.registerProvider(provider)` (the native-provider overload), which is the
 * same `Provider` shape `createDoubaoAdapter` produces. The shim is the same
 * loopback surface: pi's OpenAI-completions request hits the shim, which speaks
 * Doubao upstream.
 *
 * @module dsh-connect-doubao/pi-entry
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { Api, Model, Provider, ProviderStreams } from '@earendil-works/pi-ai'
import { createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { createDoubaoShim, type DoubaoShim } from './doubao-shim.ts'
import {
  DOUBAO_CONTEXT_WINDOW,
  DOUBAO_MAX_TOKENS,
  DOUBAO_MODELS,
  DOUBAO_PROVIDER,
  DOUBAO_PROVIDER_DISPLAY_NAME,
  DOUBAO_REASONING_LEVELS,
  enabledModelsOf,
  levelIdOf,
  type DoubaoModelInfo,
} from './doubao-catalog.ts'

/** Provider id this extension registers into pi's model registry. */
export const PI_PROVIDER_ID = DOUBAO_PROVIDER

/** Build one pi-ai model descriptor pointing at the loopback shim. */
function toPiModel(info: DoubaoModelInfo, baseUrl: string): Model<Api> {
  // pi-ai spells reasoning levels OpenAI's way; Doubao publishes 低/中/高.
  const levels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
  const rungs = (info.reasoningOptions ?? [])
    .map((option) => option.level)
    .filter((level) => Number.isFinite(level))
  const ladder = rungs.length > 0
    ? rungs
    : DOUBAO_REASONING_LEVELS.filter((level) => level.verified).map((level) => level.level)
  const weakest = levelIdOf(ladder[0] ?? 0)
  const pick = (index: number): string | null => {
    const rung = ladder[Math.min(index, ladder.length - 1)]
    return rung === undefined ? weakest : levelIdOf(rung)
  }
  const thinkingLevelMap: Record<string, string | null> = {
    minimal: weakest,
    low: pick(0),
    medium: ladder.length >= 2 ? pick(1) : null,
    high: pick(ladder.length - 1),
    ...(ladder.length >= 4 ? { xhigh: pick(3) } : { xhigh: null }),
    ...(ladder.length >= 5 ? { max: pick(4) } : { max: null }),
    off: weakest,
  }
  return {
    id: info.id,
    name: info.name,
    api: 'openai-completions',
    provider: PI_PROVIDER_ID,
    baseUrl,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DOUBAO_CONTEXT_WINDOW,
    maxTokens: DOUBAO_MAX_TOKENS,
    reasoning: info.reasoning,
    thinkingLevelMap,
    compat: { supportsReasoningEffort: info.reasoning },
  } as unknown as Model<Api>
}

/**
 * Assemble the pi-ai Provider that points at the shim, mirroring
 * `doubao-adapter.ts`'s `createDoubaoAdapter` but returning the raw pi-ai
 * Provider instead of a DSH adapter.
 */
function buildProvider(shim: DoubaoShim): Provider {
  const baseUrl = `${shim.baseUrlSync() ?? ''}/v1`
  const buildModels = (): Model<Api>[] =>
    enabledModelsOf(undefined, DOUBAO_MODELS).map((info) => toPiModel(info, baseUrl))
  return createProvider({
    id: PI_PROVIDER_ID,
    name: DOUBAO_PROVIDER_DISPLAY_NAME,
    auth: {
      apiKey: {
        name: 'Doubao loopback shim secret',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'Doubao' }
        },
      },
    },
    models: buildModels(),
    api: openAICompletionsApi() as ProviderStreams,
  }) as Provider
}

/**
 * pi extension entrypoint.
 *
 * Registers the Doubao provider into pi's ModelRegistry as a native provider.
 * The shim is created here and kept alive for the process lifetime; its
 * ephemeral port is resolved once and baked into every model's baseUrl. The
 * apiKey pi sends is the shim's per-process shared secret, which the shim
 * validates and never forwards.
 */
export default async function doubaoPiExtension(pi: ExtensionAPI): Promise<void> {
  const shim = createDoubaoShim({ toolEmulation: () => true })
  // Wait for the shim's loopback port before publishing models: pi reads the
  // provider's models when it registers them, and a model pointed at an
  // unbound port would fail on first use.
  await shim.baseUrl().catch(() => {})

  const provider = buildProvider(shim)
  // The native-provider overload: same `Provider` shape `createDoubaoAdapter`
  // produces, so the provider needs no config-form translation.
  pi.registerProvider(provider)
}
