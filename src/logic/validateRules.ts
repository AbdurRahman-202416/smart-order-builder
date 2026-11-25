import type { Group, OverrideRule, Rule, SelectedOptions, Violation } from '../types'

/**
 * Generic rules engine. It knows nothing about eggs, bread or any real id:
 * everything comes from `groups` and `rules`. Returns ALL violations, never just the first one.
 */
export function validate(selected: SelectedOptions, groups: Group[], rules: Rule[]): Violation[] {
  const optionNames = new Map(groups.flatMap((g) => g.options).map((o) => [o.id, o.name]))
  const nameOf = (optionId: string) => optionNames.get(optionId) ?? optionId
  const quantityOf = (optionId: string) => selected[optionId] ?? 0
  const isSelected = (optionId: string) => quantityOf(optionId) > 0

  const groupViolations = groups.flatMap((group) => checkGroupLimits(group, rules, quantityOf, isSelected, nameOf))
  const ruleViolations = rules.flatMap((rule) => checkCrossGroupRule(rule, isSelected, nameOf))
  return [...groupViolations, ...ruleViolations]
}

/** min, max (with overrides), step, maxDistinct and maxPerOption of one group. */
function checkGroupLimits(
  group: Group,
  rules: Rule[],
  quantityOf: (optionId: string) => number,
  isSelected: (optionId: string) => boolean,
  nameOf: (optionId: string) => string,
): Violation[] {
  const found: Violation[] = []
  const total = group.options.reduce((sum, option) => sum + quantityOf(option.id), 0)

  // An override rule REPLACES the base max. If several apply, the lowest max wins.
  const overrides = rules.filter(
    (rule): rule is OverrideRule => rule.type === 'overrideLimit' && rule.group === group.id && isSelected(rule.when),
  )
  const maxAllowed = overrides.length ? Math.min(...overrides.map((rule) => rule.max)) : group.max

  if (total < group.min) {
    found.push({
      id: `group:${group.id}:min`,
      kind: 'min',
      groupId: group.id,
      message: `${group.name}: choose at least ${group.min} (you have ${total}).`,
    })
  }

  if (total > maxAllowed) {
    const overrideRule = overrides[0]
    found.push({
      id: `group:${group.id}:max`,
      kind: 'max',
      groupId: group.id,
      ruleId: overrideRule?.id,
      message: overrideRule
        ? `${group.name}: at most ${maxAllowed} allowed when ${nameOf(overrideRule.when)} is selected (you have ${total}).`
        : `${group.name}: at most ${maxAllowed} allowed (you have ${total}).`,
    })
  }

  if (group.step && group.step > 1 && total % group.step !== 0) {
    found.push({
      id: `group:${group.id}:step`,
      kind: 'step',
      groupId: group.id,
      message:
        `${group.name}: total must be a multiple of ${group.step} (you have ${total}). ` +
        `Allowed: ${group.min}-${maxAllowed} in steps of ${group.step}.`,
    })
  }

  if (group.maxDistinct !== undefined) {
    const distinctCount = group.options.filter((option) => isSelected(option.id)).length
    if (distinctCount > group.maxDistinct) {
      found.push({
        id: `group:${group.id}:maxDistinct`,
        kind: 'maxDistinct',
        groupId: group.id,
        message: `${group.name}: at most ${group.maxDistinct} different options allowed (you have ${distinctCount}).`,
      })
    }
  }

  if (group.maxPerOption !== undefined) {
    for (const option of group.options) {
      if (quantityOf(option.id) > group.maxPerOption) {
        found.push({
          id: `group:${group.id}:maxPerOption:${option.id}`,
          kind: 'maxPerOption',
          groupId: group.id,
          message: `${group.name}: at most ${group.maxPerOption} of each option (${option.name} x${quantityOf(option.id)}).`,
        })
      }
    }
  }

  return found
}

/** "requires" and "excludes" rules. (overrideLimit rules are handled with the group limits.) */
function checkCrossGroupRule(
  rule: Rule,
  isSelected: (optionId: string) => boolean,
  nameOf: (optionId: string) => string,
): Violation[] {
  if (rule.type === 'requires' && isSelected(rule.option) && !rule.anyOf.some(isSelected)) {
    return [
      {
        id: `rule:${rule.id}`,
        kind: 'requires',
        ruleId: rule.id,
        message: `${nameOf(rule.option)} requires at least one of: ${rule.anyOf.map(nameOf).join(', ')}.`,
      },
    ]
  }

  if (rule.type === 'excludes' && isSelected(rule.option)) {
    const clashing = rule.anyOf.filter(isSelected)
    if (clashing.length > 0) {
      return [
        {
          id: `rule:${rule.id}`,
          kind: 'excludes',
          ruleId: rule.id,
          message: `${nameOf(rule.option)} cannot be combined with: ${clashing.map(nameOf).join(', ')}.`,
        },
      ]
    }
  }

  return []
}
