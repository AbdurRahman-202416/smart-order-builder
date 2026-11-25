import { describe, expect, it } from 'vitest'
import { validate } from '../logic/validateRules'
import { A, B, C, menu } from './helpers'

const v = (config: Record<string, number>) => validate(config, menu.groups, menu.rules)
const ids = (config: Record<string, number>) => v(config).map((x) => x.id)

describe('rules engine', () => {
  it('accepts the three sample configurations', () => {
    expect(v(A)).toEqual([])
    expect(v(B)).toEqual([])
    expect(v(C)).toEqual([])
  })

  it('Scrambled x1 + Fried x1 is valid (step 2)', () => {
    expect(v({ toast: 1, scrambled: 1, fried: 1, tofu: 1 })).toEqual([])
  })

  it('TC-01 Scrambled x3 breaks the eggs step', () => {
    const found = v({ toast: 1, scrambled: 3, sausage: 1 })
    expect(found.map((x) => x.id)).toEqual(['group:eggs:step'])
    expect(found[0].message).toMatch(/multiple of 2/)
    expect(found[0].message).toMatch(/2-6 in steps of 2/)
  })

  it('TC-02 Croissant + 3 extras: the override (max 2) wins over the base max 4', () => {
    const found = v({ ...A, toast: 0, croissant: 1, hashbrown: 1, mushroom: 1, beans: 1 })
    expect(found.map((x) => x.id)).toEqual(['group:extras:max'])
    expect(found[0].ruleId).toBe('R3')
    expect(found[0].message).toMatch(/at most 2/)
  })

  it('without Croissant 3 extras are fine (base max 4)', () => {
    expect(v({ ...A, hashbrown: 1, mushroom: 1, beans: 1 })).toEqual([])
  })

  it('TC-03 Hollandaise needs Scrambled or Omelette (Fried is not enough)', () => {
    expect(ids({ toast: 1, fried: 2, sausage: 1, hollandaise: 1 })).toEqual(['rule:R1'])
    expect(ids({ toast: 1, omelette: 2, sausage: 1, hollandaise: 1 })).toEqual([])
  })

  it('TC-04 excludes: lists both violations when both exist', () => {
    const found = v({ toast: 1, fried: 2, tofu: 1, bacon: 1, chili: 1, hollandaise: 1 })
    const got = found.map((x) => x.id)
    expect(got).toContain('rule:R2')
    expect(got).toContain('rule:R4')
    expect(got).toContain('rule:R1') // Fried only + Hollandaise also breaks R1: all violations, not the first
  })

  it('reports every violation at once, not only the first', () => {
    expect(ids({})).toEqual(['group:bread:min', 'group:eggs:min', 'group:protein:min'])
  })

  it('sauce limits: maxDistinct and maxPerOption', () => {
    expect(ids({ ...A, ketchup: 2 })).toEqual(['group:sauce:maxPerOption:ketchup'])
    expect(ids({ ...A, ketchup: 1, chili: 1, hollandaise: 1 })).toContain('group:sauce:maxDistinct')
  })

  it('bread: exactly one', () => {
    expect(ids({ ...A, paratha: 1 })).toEqual(['group:bread:max'])
  })
})
