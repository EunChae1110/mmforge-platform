export const designActivityEvent = 'mmforge:design-activity'
export const designSavedEvent = 'mmforge:design-saved'

export type DesignSaved = { filename: string | null; owners: string[] }

export type DesignActivity = {
  path: string
  phase: 'creating' | 'writing' | 'editing' | 'done' | 'created' | 'updated'
  until: number
  source: 'agent' | 'filesystem'
  previewReady?: boolean
}
