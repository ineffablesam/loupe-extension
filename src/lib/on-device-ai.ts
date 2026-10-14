import type { PageSnapshot } from './page-reader'
import { AI_SCHEMA, AI_SYSTEM_PROMPT, buildAiPrompt, verifyAiFindings, type Finding } from './fine-print'

export type EngineState =
  | { status: 'checking' }
  | { status: 'ready'; model: string }
  | { status: 'downloadable'; model: string }
  | { status: 'downloading'; model: string; progress: number }
  | { status: 'unavailable' }

export const MODEL_NAME = 'Gemini Nano'

const LANGUAGES = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
}
const TIMEOUT_MS = 45_000

export async function checkEngine(): Promise<EngineState> {
  if (!globalThis.LanguageModel) return { status: 'unavailable' }
  try {
    const availability = await LanguageModel!.availability(LANGUAGES)
    if (availability === 'available') return { status: 'ready', model: MODEL_NAME }
    if (availability === 'downloadable') return { status: 'downloadable', model: MODEL_NAME }
    if (availability === 'downloading') return { status: 'downloading', model: MODEL_NAME, progress: 0 }
  } catch {
    // Treated as unavailable below.
  }
  return { status: 'unavailable' }
}

let session: Promise<LanguageModelSession> | null = null

/** Creating the session also triggers the one-time model download, which needs a user click. */
export function startEngine(onProgress: (progress: number) => void) {
  session ??= LanguageModel!.create({
    ...LANGUAGES,
    temperature: 0.2,
    topK: 3,
    initialPrompts: [{ role: 'system', content: AI_SYSTEM_PROMPT }],
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress((event as ProgressEvent).loaded)
      })
    },
  }).catch((error) => {
    session = null
    throw error
  })
  return session
}

export async function findWithAi(page: PageSnapshot, onProgress: (progress: number) => void): Promise<Finding[]> {
  const base = await startEngine(onProgress)
  // Each scan uses a fresh clone so earlier pages don't leak into the answer.
  const scan = await base.clone()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const raw = await scan.prompt(buildAiPrompt(page), { responseConstraint: AI_SCHEMA, signal: controller.signal })
    const parsed = JSON.parse(raw) as { findings?: Parameters<typeof verifyAiFindings>[1] }
    return verifyAiFindings(page, parsed.findings ?? [])
  } finally {
    clearTimeout(timer)
    scan.destroy()
  }
}
