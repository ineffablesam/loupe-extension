// Chrome built-in AI (Prompt API). Only the surface Loupe uses.

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface LanguageModelExpected {
  type: 'text'
  languages?: string[]
}

interface LanguageModelCreateOptions {
  temperature?: number
  topK?: number
  expectedInputs?: LanguageModelExpected[]
  expectedOutputs?: LanguageModelExpected[]
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  signal?: AbortSignal
  monitor?: (monitor: EventTarget) => void
}

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>
  clone(): Promise<LanguageModelSession>
  destroy(): void
}

declare var LanguageModel:
  | {
      availability(options?: Omit<LanguageModelCreateOptions, 'monitor' | 'signal'>): Promise<LanguageModelAvailability>
      create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
    }
  | undefined
