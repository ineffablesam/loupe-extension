import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface BuildMeta {
  buildId: number
  /** Changes when anything Chrome only picks up on a full extension reload changes. */
  shellHash: string
  panelShellHash?: string
  contentHash?: string
}

/** Both Vite builds (panel and content script) share one build-meta.json. */
export function updateBuildMeta(outDir: string, patch: Partial<Pick<BuildMeta, 'buildId' | 'panelShellHash' | 'contentHash'>>) {
  const file = join(outDir, 'build-meta.json')
  const current: Partial<BuildMeta> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const next = { ...current, ...patch }
  const shellHash = createHash('sha1')
    .update(`${next.panelShellHash ?? ''}:${next.contentHash ?? ''}`)
    .digest('hex')
    .slice(0, 12)
  writeFileSync(file, JSON.stringify({ ...next, buildId: next.buildId ?? Date.now(), shellHash }))
}
