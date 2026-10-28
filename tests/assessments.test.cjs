/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const typescript = require("typescript")

function loadTypeScriptModule(relativePath, aliases = {}) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }).outputText
  const transpiledModule = { exports: {} }
  const customRequire = (moduleName) =>
    Object.hasOwn(aliases, moduleName)
      ? aliases[moduleName]
      : require(moduleName)

  new Function("require", "module", "exports", compiled)(
    customRequire,
    transpiledModule,
    transpiledModule.exports
  )
  return transpiledModule.exports
}

const fees = loadTypeScriptModule("../src/lib/fees.ts")
const feeSchedule = fees.feeScheduleFor("change_unit")
let applicationTransactionCode = "change_unit"
let insertedAssessments = []

function createSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "assessor-test-user" } },
        error: null,
      }),
    },
    schema: () => ({
      from(table) {
        let insertedValue = null
        const query = {
          select() {
            return query
          },
          eq() {
            return query
          },
          insert(value) {
            insertedValue = value
            insertedAssessments.push(value)
            return query
          },
          single: async () => {
            if (table === "mtop_applications") {
              return {
                data: {
                  id: "change-unit-application",
                  transaction_type: { code: applicationTransactionCode },
                },
                error: null,
              }
            }
            return {
              data: { id: "assessment-test-id", ...insertedValue },
              error: null,
            }
          },
        }
        return query
      },
    }),
  }
}

const assessmentActions = loadTypeScriptModule(
  "../src/lib/actions/assessments.ts",
  {
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => createSupabaseClient() },
    "@/lib/schemas/mtop": {
      assessmentSchema: {
        safeParse: (value) => ({ success: true, data: value }),
      },
    },
    "@/lib/permissions": { hasPermission: async () => true },
    "@/lib/fees": fees,
  }
)

function assessmentInput(certificationFee) {
  return {
    ...feeSchedule,
    certification_fee: certificationFee,
  }
}

test("server saves the selected Change Unit fee once and includes it in total", async () => {
  applicationTransactionCode = "change_unit"
  insertedAssessments = []

  const result = await assessmentActions.createAssessment(
    "change-unit-application",
    assessmentInput(100)
  )

  assert.equal(result.error, null)
  assert.equal(insertedAssessments.length, 1)
  assert.equal(insertedAssessments[0].certification_fee, 100)
  assert.equal(insertedAssessments[0].total_amount, 2080)
})

test("server saves an unchecked Change Unit fee as zero", async () => {
  applicationTransactionCode = "change_unit"
  insertedAssessments = []

  const result = await assessmentActions.createAssessment(
    "change-unit-application",
    assessmentInput(0)
  )

  assert.equal(result.error, null)
  assert.equal(insertedAssessments.length, 1)
  assert.equal(insertedAssessments[0].certification_fee, 0)
  assert.equal(insertedAssessments[0].total_amount, 1980)
})

test("server rejects non-fixed Change Unit certification fees", async () => {
  applicationTransactionCode = "change_unit"
  insertedAssessments = []

  const result = await assessmentActions.createAssessment(
    "change-unit-application",
    assessmentInput(50)
  )

  assert.match(result.error, /must be ₱0 or ₱100/)
  assert.equal(result.data, null)
  assert.equal(insertedAssessments.length, 0)
})
