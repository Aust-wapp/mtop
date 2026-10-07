const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")

// Load the production TypeScript module without introducing a test runner.
const feeModulePath = path.join(__dirname, "../src/lib/fees.ts")
const feeSource = fs.readFileSync(feeModulePath, "utf8")
const compiledFees = typescript.transpileModule(feeSource, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2020,
  },
}).outputText
const feeModule = { exports: {} }
new Function("require", "module", "exports", compiledFees)(
  require,
  feeModule,
  feeModule.exports
)

const {
  ALL_FEE_KEYS,
  STANDARD_FEE_KEYS,
  TRANSACTION_FEE_KEYS,
  calculateFeeTotal,
  calculateLatePenalty,
  assessmentFeesForStorage,
  feeLinesFromStoredAssessment,
  feeKeysFor,
  feeScheduleFor,
  isValidLostPlateReplacementFee,
  LOST_PLATE_REPLACEMENT_FEE,
} = feeModule.exports

const assessmentSchemaSource = fs.readFileSync(
  path.join(__dirname, "../src/lib/schemas/mtop.ts"),
  "utf8"
)
const compiledAssessmentSchema = typescript.transpileModule(
  assessmentSchemaSource,
  {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }
).outputText
const assessmentSchemaModule = { exports: {} }
const assessmentSchemaRequire = (moduleName) => {
  if (moduleName === "@/lib/fees") return feeModule.exports
  if (moduleName === "@/lib/operator-name") {
    return { findCoOwnerMarker: () => null, SINGLE_OPERATOR_MESSAGE: "" }
  }
  return require(moduleName)
}
new Function("require", "module", "exports", compiledAssessmentSchema)(
  assessmentSchemaRequire,
  assessmentSchemaModule,
  assessmentSchemaModule.exports
)
const { assessmentSchema } = assessmentSchemaModule.exports

const standardFees = {
  filing_fee: 250,
  supervision_fee: 100,
  confirmation_fee: 65,
  mayors_permit_fee: 150,
  franchise_fee: 250,
  police_clearance_fee: 50,
  health_fee: 50,
  legal_research_fee: 65,
  parking_fee: 770,
}

function sumFees(fees) {
  return calculateFeeTotal(fees)
}

test("standard fee bundle totals ₱1,750 for new, renewal, and ownership", () => {
  for (const transactionCode of [
    "new_franchise",
    "renewal",
    "change_ownership",
  ]) {
    const fees = feeScheduleFor(transactionCode)
    const standardLines = Object.fromEntries(
      STANDARD_FEE_KEYS.map((key) => [key, fees[key]])
    )

    assert.deepEqual(standardLines, standardFees, transactionCode)
    assert.equal(sumFees(fees), 1750, transactionCode)
  }
})

test("renewal adds the existing late penalty on top of the standard bundle", () => {
  const fees = feeScheduleFor("renewal", 200)

  assert.equal(fees.late_renewal_penalty, 200)
  assert.equal(sumFees(fees), 1950)
  assert.equal(
    calculateLatePenalty(new Date(2026, 0, 1), new Date(2026, 0, 1)),
    0
  )
  assert.equal(
    calculateLatePenalty(new Date(2026, 0, 1), new Date(2026, 0, 31)),
    50
  )
  assert.equal(
    calculateLatePenalty(new Date(2026, 0, 1), new Date(2026, 1, 1)),
    125
  )
})

test("change unit waives parking and charges the change-of-motor fee", () => {
  const fees = feeScheduleFor("change_unit")

  assert.equal(fees.parking_fee, 0)
  assert.equal(fees.change_of_motor_fee, 1000)
  assert.equal(sumFees(fees), 1980)
})

test("annual confirmation is separate from the standard confirmation fee", () => {
  const fees = feeScheduleFor("annual_confirmation")

  assert.equal(fees.confirmation_fee, 0)
  assert.equal(fees.annual_confirmation_transaction_fee, 100)
  assert.equal(sumFees(fees), 100)
  assert.ok(STANDARD_FEE_KEYS.every((key) => fees[key] === 0))
})

test("re-issuance charges only its own fee", () => {
  const fees = feeScheduleFor("reissuance")

  assert.equal(fees.reissuance_transaction_fee, 150)
  assert.equal(sumFees(fees), 150)
  assert.ok(STANDARD_FEE_KEYS.every((key) => fees[key] === 0))
})

test("transaction-only rows persist through total and transaction type", () => {
  const annual = feeScheduleFor("annual_confirmation")
  const annualStored = assessmentFeesForStorage(annual)
  const annualTotal = calculateFeeTotal(annual)

  assert.equal(annualStored.annual_confirmation_transaction_fee, undefined)
  assert.equal(annualTotal, 100)
  assert.equal(
    feeLinesFromStoredAssessment(
      { ...annualStored, total_amount: annualTotal },
      "annual_confirmation"
    ).annual_confirmation_transaction_fee,
    100
  )

  const reissuance = feeScheduleFor("reissuance")
  const reissuanceStored = assessmentFeesForStorage(reissuance)
  const reissuanceTotal = calculateFeeTotal(reissuance)

  assert.equal(reissuanceStored.reissuance_transaction_fee, undefined)
  assert.equal(reissuanceTotal, 150)
  assert.equal(
    feeLinesFromStoredAssessment(
      { ...reissuanceStored, total_amount: reissuanceTotal },
      "reissuance"
    ).reissuance_transaction_fee,
    150
  )

  const annualWithLostPlate = {
    ...annual,
    replacement_plate_fee: 500,
  }
  const annualWithLostPlateStored = assessmentFeesForStorage(annualWithLostPlate)
  assert.equal(
    feeLinesFromStoredAssessment(
      {
        ...annualWithLostPlateStored,
        total_amount: calculateFeeTotal(annualWithLostPlate),
      },
      "annual_confirmation"
    ).annual_confirmation_transaction_fee,
    100
  )
})

test("closure shows two distinct fee lines that total ₱600", () => {
  const fees = feeScheduleFor("closure")

  assert.equal(fees.certification_fee, 100)
  assert.equal(fees.closure_fee, 500)
  assert.equal(sumFees(fees), 600)
  assert.ok(STANDARD_FEE_KEYS.every((key) => fees[key] === 0))
})

test("lost-plate replacement is optional for all seven transactions", () => {
  const transactionCodes = [
    "new_franchise",
    "renewal",
    "change_ownership",
    "change_unit",
    "annual_confirmation",
    "reissuance",
    "closure",
  ]

  assert.equal(ALL_FEE_KEYS.length, 16)
  assert.equal(TRANSACTION_FEE_KEYS.length, 6)

  for (const transactionCode of transactionCodes) {
    const fees = feeScheduleFor(transactionCode)
    assert.deepEqual(Object.keys(fees), [...ALL_FEE_KEYS], transactionCode)
    assert.equal(fees.replacement_plate_fee, 0, transactionCode)
    assert.ok(feeKeysFor(transactionCode).includes("replacement_plate_fee"))
    assert.ok(
      feeKeysFor(transactionCode).every((key) => ALL_FEE_KEYS.includes(key)),
      transactionCode
    )

    const checkedFees = {
      ...fees,
      replacement_plate_fee: LOST_PLATE_REPLACEMENT_FEE,
    }
    assert.equal(sumFees(checkedFees), sumFees(fees) + 500, transactionCode)
    assert.equal(
      sumFees({ ...checkedFees, replacement_plate_fee: 0 }),
      sumFees(fees)
    )
  }

  assert.equal(isValidLostPlateReplacementFee(0), true)
  assert.equal(isValidLostPlateReplacementFee(500), true)
  assert.equal(isValidLostPlateReplacementFee(200), false)
  assert.equal(isValidLostPlateReplacementFee(700), false)
  assert.equal(isValidLostPlateReplacementFee(999), false)
})

test("assessment validation accepts only zero or the fixed lost-plate fee", () => {
  const zeroAssessment = Object.fromEntries(
    ALL_FEE_KEYS.map((key) => [key, 0])
  )

  assert.equal(
    assessmentSchema.safeParse({
      ...zeroAssessment,
      replacement_plate_fee: 0,
    }).success,
    true
  )
  assert.equal(
    assessmentSchema.safeParse({
      ...zeroAssessment,
      replacement_plate_fee: 500,
    }).success,
    true
  )

  for (const amount of [200, 700, 999]) {
    assert.equal(
      assessmentSchema.safeParse({
        ...zeroAssessment,
        replacement_plate_fee: amount,
      }).success,
      false,
      `amount ${amount} must be rejected`
    )
  }
})

test("unknown transaction types fail closed to a zero schedule", () => {
  const fees = feeScheduleFor("unknown_transaction", 500)

  assert.ok(ALL_FEE_KEYS.every((key) => fees[key] === 0))
  assert.equal(sumFees(fees), 0)
  assert.deepEqual(feeKeysFor("unknown_transaction"), [])
})
