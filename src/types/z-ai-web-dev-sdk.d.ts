/**
 * Type declarations for z-ai-web-dev-sdk (optional dependency).
 *
 * This package is NOT installed in node_modules — it's an optional runtime
 * dependency used only by the AI Poster Generator feature. When the SDK is
 * not available, the poster API returns a helpful error message instead of
 * crashing. This declaration file prevents TypeScript from failing the build
 * with "Cannot find module 'z-ai-web-dev-sdk'".
 */
declare module 'z-ai-web-dev-sdk' {
  interface ZaiConfig {
    baseUrl: string
    apiKey: string
    chatId?: string
    userId?: string
    token?: string
  }

  interface ZaiInstance {
    config: ZaiConfig
    generateImage(opts: { prompt: string; size?: string }): Promise<{
      data: Array<{ base64?: string; url?: string }>
    }>
  }

  interface ZaiConstructor {
    create(): Promise<ZaiInstance>
    new (config: ZaiConfig): ZaiInstance
  }

  const ZAI: ZaiConstructor
  export default ZAI
}
