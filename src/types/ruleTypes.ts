// What the rules engine returns.

export interface Violation {
  /** Stable id, e.g. "group:eggs:step" or "rule:R2". */
  id: string
  kind: 'min' | 'max' | 'step' | 'maxDistinct' | 'maxPerOption' | 'requires' | 'excludes'
  groupId?: string
  ruleId?: string
  message: string
}
