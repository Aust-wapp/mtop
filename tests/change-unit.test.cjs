/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")

function loadTypeScriptModule(relativePath, mockedModules = {}) {
  const filePath = path.join(__dirname, relativePath)
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }).outputText
  const transpiledModule = { exports: {} }
  const mockedRequire = (moduleName) =>
    Object.hasOwn(mockedModules, moduleName)
      ? mockedModules[moduleName]
      : require(moduleName)

  new Function("require", "module", "exports", compiled)(
    mockedRequire,
    transpiledModule,
    transpiledModule.exports
  )

  return transpiledModule.exports
}

const schemas = loadTypeScriptModule("../src/lib/schemas/mtop.ts", {
  "@/lib/fees": { isValidLostPlateReplacementFee: () => true },
  "@/lib/operator-name": {
    findCoOwnerMarker: () => null,
    SINGLE_OPERATOR_MESSAGE: "",
  },
})

function createActionHarness({ canCreate = true } = {}) {
  const state = {
    franchiseUpdate: null,
    applicationInsert: null,
    otherWrites: [],
  }

  function resultFor(table, operation) {
    if (table === "transaction_types" && operation === "select") {
      return {
        data: {
          id: "change-unit-type",
          code: "change_unit",
          name: "Change of Unit",
          grant_effect: "replace_unit",
        },
        error: null,
      }
    }

    if (table === "mtop_franchises" && operation === "select") {
      return {
        data: {
          id: "c7d88cb2-c843-4b4f-9cf8-3dc913b4c9b6",
          mtop_number: "AO-SNGF-2026-0001",
          granted_until: "2027-12-31",
          franchise_status: "active",
          make: "Honda",
          motor_number: "OLD-MOTOR",
          chassis_number: "OLD-CHASSIS",
        },
        error: null,
      }
    }

    if (table === "mtop_applications" && operation === "insert") {
      return { data: { id: "change-unit-application" }, error: null }
    }

    if (table === "mtop_applications" && operation === "select") {
      return { data: [], error: null }
    }

    if (table === "transaction_requirements" && operation === "select") {
      return { data: [{ requirement_id: "change-unit-requirement" }], error: null }
    }

    return { data: null, error: null }
  }

  function makeQuery(table) {
    let operation = "select"
    const query = {
      select() {
        return query
      },
      eq() {
        return query
      },
      in() {
        return query
      },
      limit() {
        return query
      },
      update(values) {
        operation = "update"
        if (table === "mtop_franchises") state.franchiseUpdate = values
        state.otherWrites.push({ table, operation, values })
        return query
      },
      insert(values) {
        operation = "insert"
        if (table === "mtop_applications") state.applicationInsert = values
        state.otherWrites.push({ table, operation, values })
        return query
      },
      maybeSingle() {
        return Promise.resolve(resultFor(table, operation))
      },
      single() {
        return Promise.resolve(resultFor(table, operation))
      },
      then(resolve, reject) {
        return Promise.resolve(resultFor(table, operation)).then(resolve, reject)
      },
    }

    return query
  }

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "verification-user" } },
        error: null,
      }),
    },
    schema: () => ({
      from: makeQuery,
      rpc: async () => ({ data: [], error: null }),
    }),
  }

  const actions = loadTypeScriptModule("../src/lib/actions/applications.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/actions/settings": {
      getSystemSettings: async () => ({
        error: null,
        data: { renewal_window_days: 90, abandonment_grace_days: 120 },
      }),
    },
    "@/lib/schemas/mtop": schemas,
    "@/lib/operator-name": {
      normalizeOperatorName: () => "",
      findCoOwnerMarker: () => null,
      SINGLE_OPERATOR_MESSAGE: "",
      composeOperatorName: () => "",
      namePart: (value) => value?.trim() || null,
    },
    "@/lib/unit-identifier": {
      normalizeUnitIdentifier: (value) => (value ?? "").trim().toUpperCase(),
      unitConflictMessage: () => "Unit number conflict",
    },
    "@/lib/application-flow": {
      reopenTargetStage: () => "for_verification",
      remarksRequiredMessage: () => "Remarks are required",
    },
    "@/lib/address": { composeAddress: () => "Ozamiz City" },
    "@/lib/permissions": {
      hasPermission: async () => canCreate,
    },
    "@/lib/utils/plate-expiration": {
      isLaterDateOnly: () => true,
      parseDateOnly: () => null,
    },
    "@/lib/utils/permit-expiration": {
      expiryBlockMessage: () => "Expired",
      isBlockedByExpiry: () => false,
    },
  })

  return { actions, state }
}

function validChangeUnitInput(overrides = {}) {
  return {
    franchise_id: "c7d88cb2-c843-4b4f-9cf8-3dc913b4c9b6",
    transaction_type_code: "change_unit",
    make: "Suzuki",
    new_make: " Yamaha ",
    new_motor_number: " NEW-MOTOR ",
    new_chassis_number: " NEW-CHASSIS ",
    new_plate_number: " NEW-PLATE ",
    ...overrides,
  }
}

test("Change Unit requires a nonblank replacement make and trims it", () => {
  const baseInput = validChangeUnitInput()
  const missingMake = schemas.franchiseTransactionSchema.safeParse({
    ...baseInput,
    new_make: "   ",
  })
  const validMake = schemas.franchiseTransactionSchema.safeParse(baseInput)

  assert.equal(missingMake.success, false)
  assert.ok(
    missingMake.error.issues.some((issue) => issue.path[0] === "new_make")
  )
  assert.equal(validMake.success, true)
  assert.equal(validMake.data.new_make, "Yamaha")
})

test("filing stages replacement make without changing the current make", async () => {
  const { actions, state } = createActionHarness()

  const result = await actions.createFranchiseTransaction(
    validChangeUnitInput()
  )

  assert.equal(result.error, null)
  assert.equal(state.applicationInsert.new_make, "Yamaha")
  assert.equal(state.applicationInsert.new_motor_number, "NEW-MOTOR")
  assert.equal(state.applicationInsert.new_chassis_number, "NEW-CHASSIS")
  assert.equal(state.franchiseUpdate.make, undefined)
  assert.equal(state.franchiseUpdate.motor_number, undefined)
  assert.equal(state.franchiseUpdate.chassis_number, undefined)
})

test("server action rejects a blank replacement make before writing", async () => {
  const { actions, state } = createActionHarness()

  const result = await actions.createFranchiseTransaction(
    validChangeUnitInput({ new_make: "  " })
  )

  assert.equal(result.data, null)
  assert.match(result.error, /New make or brand is required/)
  assert.equal(state.franchiseUpdate, null)
  assert.equal(state.applicationInsert, null)
})

test("Change Unit filing still requires the application-create permission", async () => {
  const { actions, state } = createActionHarness({ canCreate: false })

  const result = await actions.createFranchiseTransaction(
    validChangeUnitInput()
  )

  assert.equal(result.data, null)
  assert.match(result.error, /permission to file applications/)
  assert.equal(state.franchiseUpdate, null)
  assert.equal(state.applicationInsert, null)
})

test("Change Unit form distinguishes read-only Previous Unit from replacement brand", () => {
  const form = fs.readFileSync(
    path.join(__dirname, "../src/app/dashboard/applications/new/franchise-transaction-form.tsx"),
    "utf8"
  )

  assert.match(form, /Previous Unit Make \/ Brand/)
  assert.match(form, /Previous Unit Motor Number/)
  assert.match(form, /Previous Unit Chassis Number/)
  assert.match(form, /Previous Unit Plate Number/)
  assert.match(form, /Replacement Make \/ Brand/)
  assert.match(form, /new_make: ""/)
})

test("database stores Change Unit makes only when the application is granted", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../supabase/migrations/20261028000034_certification_support.sql"
    ),
    "utf8"
  )

  assert.match(
    migration,
    /WHEN \(NEW\.status = 'granted' AND OLD\.status IS DISTINCT FROM NEW\.status\)/
  )
  assert.match(
    migration,
    /UPDATE mtop\.franchise_unit_history\s+SET previous_make = v_previous_make,\s+new_make = NULLIF\(btrim\(NEW\.new_make\), ''\)\s+WHERE application_id = NEW\.id/
  )
  assert.match(
    migration,
    /UPDATE mtop\.mtop_franchises\s+SET make = NULLIF\(btrim\(NEW\.new_make\), ''\)/
  )
})
