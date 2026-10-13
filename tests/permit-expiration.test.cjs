/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")
const { format } = require("date-fns")

const modulePath = path.join(
  __dirname,
  "../src/lib/utils/permit-expiration.ts"
)
const source = fs.readFileSync(modulePath, "utf8")
const compiled = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2020,
  },
}).outputText
const expirationModule = { exports: {} }
const mockedRequire = (moduleName) => {
  if (moduleName === "@/lib/office-time") {
    return { officeDateParts: () => ({ year: 2026, month: 10, day: 9 }) }
  }
  return require(moduleName)
}
new Function("require", "module", "exports", compiled)(
  mockedRequire,
  expirationModule,
  expirationModule.exports
)

const {
  getExpirationStatusOnDate,
  isBlockedByExpiry,
} = expirationModule.exports

const schemaPath = path.join(__dirname, "../src/lib/schemas/mtop.ts")
const schemaSource = fs.readFileSync(schemaPath, "utf8")
const compiledSchemas = typescript.transpileModule(schemaSource, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2020,
  },
}).outputText
const schemaModule = { exports: {} }
const mockedSchemaRequire = (moduleName) => {
  if (moduleName === "@/lib/fees") {
    return { isValidLostPlateReplacementFee: () => true }
  }
  if (moduleName === "@/lib/operator-name") {
    return { findCoOwnerMarker: () => null, SINGLE_OPERATOR_MESSAGE: "" }
  }
  return require(moduleName)
}
new Function("require", "module", "exports", compiledSchemas)(
  mockedSchemaRequire,
  schemaModule,
  schemaModule.exports
)
const { systemSettingsSchema } = schemaModule.exports

const franchiseStatusPath = path.join(
  __dirname,
  "../src/lib/utils/franchise-status.ts"
)
const franchiseStatusSource = fs.readFileSync(franchiseStatusPath, "utf8")
const compiledFranchiseStatus = typescript.transpileModule(
  franchiseStatusSource,
  {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }
).outputText
const franchiseStatusModule = { exports: {} }
const mockedFranchiseRequire = (moduleName) => {
  if (moduleName === "@/lib/utils/permit-expiration") {
    return { getExpirationStatus: expirationModule.exports.getExpirationStatus }
  }
  return require(moduleName)
}
new Function("require", "module", "exports", compiledFranchiseStatus)(
  mockedFranchiseRequire,
  franchiseStatusModule,
  franchiseStatusModule.exports
)
const { getFranchiseStatusDisplay } = franchiseStatusModule.exports

const today = new Date(2026, 9, 9)

function expiryDate(daysFromToday) {
  const date = new Date(today)
  date.setDate(date.getDate() + daysFromToday)
  return format(date, "yyyy-MM-dd")
}

function status(daysFromToday, renewalWindowDays = 120, graceDays = 120) {
  return getExpirationStatusOnDate(
    expiryDate(daysFromToday),
    today,
    renewalWindowDays,
    graceDays
  )
}

test("permit expiry boundaries use the renewal window and abandonment setting", () => {
  assert.equal(status(120).status, "due_for_renewal")
  assert.equal(status(0).status, "due_for_renewal")
  assert.equal(status(-1).status, "expired")
  assert.equal(status(-30).status, "expired")
  assert.equal(status(-119).status, "expired")
  assert.equal(status(-120).status, "expired")
  assert.equal(status(-121).status, "abandoned")
  assert.equal(status(-122).status, "abandoned")
})

test("changing the abandonment setting to 60 days changes only the post-expiry boundary", () => {
  assert.equal(status(-60, 120, 60).status, "expired")
  assert.equal(status(-61, 120, 60).status, "abandoned")
  assert.equal(status(-120, 120, 120).status, "expired")
  assert.equal(status(-121, 120, 120).status, "abandoned")
})

test("unclassified franchises follow the current threshold across the requested changes", () => {
  // A 125-day-old franchise that has not been swept stays active after the
  // 120 -> 130 increase, then becomes abandoned when the threshold is lowered.
  assert.equal(status(-125, 120, 130).status, "expired")
  assert.equal(status(-125, 120, 90).status, "abandoned")

  // After the 90 -> 150 increase, a 140-day-old unclassified franchise is
  // expired, while one beyond the new threshold is abandoned.
  assert.equal(status(-140, 120, 150).status, "expired")
  assert.equal(status(-151, 120, 150).status, "abandoned")
})

test("persisted abandoned status stays abandoned after threshold changes and reload", () => {
  const storedFranchise = JSON.parse(
    JSON.stringify({
      franchise_status: "abandoned",
      abandoned_at: "2026-06-01T16:00:00.000Z",
      granted_until: expiryDate(-121),
    })
  )

  for (const graceDays of [130, 90, 150]) {
    const display = getFranchiseStatusDisplay(
      storedFranchise.franchise_status,
      storedFranchise.granted_until,
      120,
      graceDays
    )
    assert.equal(display.statusLabel, "Abandoned")
    assert.equal(display.isActive, false)
    assert.equal(display.expiration, null)
    assert.equal(storedFranchise.abandoned_at, "2026-06-01T16:00:00.000Z")
  }
})

test("new renewal eligibility ends after the configured post-expiry period", () => {
  assert.equal(isBlockedByExpiry(expiryDate(-120), "renewal", 120, 120), false)
  assert.equal(isBlockedByExpiry(expiryDate(-121), "renewal", 120, 120), true)
  assert.equal(isBlockedByExpiry(expiryDate(-61), "renewal", 120, 60), true)
  assert.equal(isBlockedByExpiry(expiryDate(-121), "closure", 120, 120), false)
})

test("abandonment period setting accepts only non-negative whole numbers", () => {
  const values = {
    permit_validity_years: 3,
    renewal_window_days: 120,
    abandonment_grace_days: 0,
    ctms_contact_number: "",
    mayor_name: "",
  }

  assert.equal(systemSettingsSchema.safeParse(values).success, true)
  assert.equal(
    systemSettingsSchema.safeParse({ ...values, abandonment_grace_days: 60 })
      .success,
    true
  )
  assert.equal(
    systemSettingsSchema.safeParse({ ...values, abandonment_grace_days: -1 })
      .success,
    false
  )
  assert.equal(
    systemSettingsSchema.safeParse({ ...values, abandonment_grace_days: 1.5 })
      .success,
    false
  )
})

test("derived abandonment does not replace stored non-active lifecycle statuses", () => {
  for (const lifecycleStatus of ["closed", "revoked", "cancelled", "abandoned"]) {
    const display = getFranchiseStatusDisplay(
      lifecycleStatus,
      expiryDate(-121),
      120,
      120
    )

    assert.equal(display.statusLabel, lifecycleStatus[0].toUpperCase() + lifecycleStatus.slice(1))
    assert.equal(display.expiration, null)
  }
})

test("franchise status display follows the derived permit status for active records", () => {
  const cases = [
    [-121, "Abandoned", "abandoned"],
    [-120, "Expired", "expired"],
    [0, "Due for Renewal", "due_for_renewal"],
    [121, "Active", "active"],
  ]

  for (const [daysRemaining, expectedLabel, expectedStatus] of cases) {
    const display = getFranchiseStatusDisplay(
      "active",
      expiryDate(daysRemaining),
      120,
      120
    )

    assert.equal(display.statusLabel, expectedLabel)
    assert.equal(display.expiration.status, expectedStatus)
    assert.equal(display.expiration.daysRemaining, daysRemaining)
  }
})
