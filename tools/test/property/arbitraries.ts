import * as fc from "fast-check"

const SPEC_JSON_PHASES = ["spec", "plan", "tasks", "ready", "impl", "complete"] as const
const SESSION_PHASES = ["init", "spec", "plan", "tasks", "ready", "impl", "complete"] as const

export function arbitrarySessionState(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    command: fc.option(fc.string(), { nil: null }),
    phase: fc.constantFrom(...SESSION_PHASES),
    featureDir: fc.option(fc.string(), { nil: null }),
    featureNumber: fc.option(fc.integer({ min: 0, max: 9999 }), { nil: null }),
    featureName: fc.option(fc.string(), { nil: null }),
    nextStep: fc.option(fc.string(), { nil: null }),
    lastResult: fc.option(fc.string(), { nil: null }),
    history: fc.array(fc.string()),
  })
}

export function arbitrarySpecJson(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    feature_name: fc.string({ minLength: 1 }),
    feature_number: fc.integer({ min: 0, max: 9999 }),
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
    phase: fc.constantFrom(...SPEC_JSON_PHASES),
    approvals: fc.record({
      spec: fc.record({ generated: fc.boolean(), approved: fc.boolean() }),
      plan: fc.record({ generated: fc.boolean(), approved: fc.boolean() }),
      tasks: fc.record({ generated: fc.boolean(), approved: fc.boolean() }),
    }),
    ready_for_implementation: fc.boolean(),
    active_delta: fc.option(fc.string(), { null: null }),
  })
}

export function arbitrarySDDConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    defaultTechStack: fc.option(fc.string(), { nil: null }),
    lastUsedLanguage: fc.option(fc.string(), { nil: null }),
    expressMode: fc.boolean(),
    autoVersioning: fc.boolean(),
    preferences: fc.dictionary(fc.string(), fc.string()),
  })
}

export function arbitraryInvalidSessionState(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.record({}),
    fc.record({ phase: fc.integer() }),
    fc.record({ phase: fc.string() }),
    fc.record({ command: fc.integer(), phase: fc.constant("spec") }),
    fc.record({ history: fc.string() }),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(""),
    fc.constant(42),
  )
}

export function arbitraryInvalidSpecJson(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.record({}),
    fc.record({ feature_name: fc.integer() }),
    fc.record({ feature_name: fc.string(), phase: fc.integer() }),
    fc.record({ feature_name: fc.string(), feature_number: fc.string() }),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(""),
    fc.constant(42),
  )
}

export function arbitraryInvalidSDDConfig(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.record({}),
    fc.record({ expressMode: fc.string() }),
    fc.record({ expressMode: fc.boolean(), autoVersioning: fc.string() }),
    fc.record({ preferences: fc.array(fc.string()) }),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant(""),
    fc.constant(42),
  )
}

export function arbitraryValidPhase(): fc.Arbitrary<string> {
  return fc.constantFrom(...SPEC_JSON_PHASES)
}

export function arbitraryString(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1 })
}
