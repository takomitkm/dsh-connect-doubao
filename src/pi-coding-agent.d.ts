/**
 * Ambient declaration for @earendil-works/pi-coding-agent.
 *
 * The published package declares `types: ./dist/index.d.ts` but ships no
 * `index.d.ts` (only `index.d.ts.map`), so TypeScript cannot resolve the real
 * types. This is a minimal ambient declaration covering exactly the surface a
 * pi extension needs here: the `ExtensionAPI` handed to an extension's default
 * export. Members beyond `registerProvider` are declared as `unknown`-ish so a
 * wrong guess fails loudly at the call site rather than typechecking silently.
 */
declare module '@earendil-works/pi-coding-agent' {
  /**
   * pi's `ModelRegistry` as a pi extension sees it through `ExtensionAPI`.
   *
   * The native-provider overload (`registerProvider(provider: Provider)`) is
   * the one this package's pi entry uses — the same `Provider` shape
   * `createProvider` from `@earendil-works/pi-ai` produces.
   */
  export interface ModelRegistryLike {
    registerProvider(provider: unknown): void
    registerProvider(providerName: string, config: unknown): void
    unregisterProvider(providerName: string): void
  }

  /**
   * Minimal shape of pi's `ExtensionAPI` as consumed by this package.
   *
   * `registerProvider` is the only member used. The rest are omitted on
   * purpose: declaring what we do not use risks baking in a wrong signature.
   */
  export interface ExtensionAPI {
    registerProvider: ModelRegistryLike['registerProvider']
  }

  export default ExtensionAPI
}
