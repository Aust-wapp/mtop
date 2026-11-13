/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/actions/card.ts"), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

test("regenerated standard cards use current officials without changing grant records", async () => {
  const sampleId = "4f078376-89e2-48c8-8fe3-64d80c9bc8f2"
  const queriedTables = []
  const signedPaths = []
  const settings = {
    permit_validity_years: 3,
    ctms_contact_number: "",
    mayor_name: "adwad",
    mayor_designation: "City Mayor",
    mayor_signature_path: "mayor/current.png",
    city_treasurer_name: "adwa",
    city_treasurer_designation: "City Treasurer",
    city_treasurer_signature_path: "city_treasurer/current.webp",
  }
  const franchise = { id: "franchise-id", applicant_name: "Sample", mtop_number: "TEST-1" }
  const application = {
    id: sampleId,
    status: "granted",
    franchise,
    granted_at: "2026-11-13T00:00:00Z",
    expiration_date: null,
  }

  function query(table) {
    queriedTables.push(table)
    const result = table === "mtop_payments"
      ? { data: [], error: null }
      : { data: [], count: 0, error: null }
    const chain = {
      select() { return chain },
      eq() { return chain },
      lt() { return chain },
      lte() { return chain },
      order() { return Promise.resolve(result) },
      single() { return Promise.resolve({ data: application, error: null }) },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
    }
    return chain
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "staff-id" } } }) },
    schema: () => ({ from: query }),
    storage: {
      from: () => ({ createSignedUrl: async (objectPath) => {
        signedPaths.push(objectPath)
        return { data: { signedUrl: `signed:${objectPath}` }, error: null }
      } }),
    },
  }
  const modules = {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/actions/settings": { getSystemSettings: async () => ({ data: { ...settings }, error: null }) },
    "@/lib/address": { displayAddress: () => "Sample address" },
    "@/lib/office-time": { officeDateParts: () => ({ year: 2026, month: 11, day: 13 }) },
    "@/lib/permissions": { hasPermission: async () => true },
  }
  const loaded = { exports: {} }
  new Function("require", "module", "exports", compiled)(
    (name) => modules[name] ?? require(name), loaded, loaded.exports,
  )

  const first = await loaded.exports.getFranchiseCardData(sampleId)
  assert.equal(first.error, null)
  assert.equal(first.data.mayorName, "adwad")
  assert.equal(first.data.treasurerName, "adwa")
  assert.equal(first.data.mayorSignatureUrl, "signed:mayor/current.png")
  assert.equal(first.data.treasurerSignatureUrl, "signed:city_treasurer/current.webp")

  settings.mayor_name = "Updated Mayor"
  settings.mayor_signature_path = "mayor/replacement.webp"
  const second = await loaded.exports.getFranchiseCardData(sampleId)
  assert.equal(second.data.mayorName, "Updated Mayor")
  assert.equal(second.data.mayorSignatureUrl, "signed:mayor/replacement.webp")
  assert.equal(second.data.treasurerName, "adwa")
  assert.deepEqual(signedPaths, [
    "mayor/current.png", "city_treasurer/current.webp",
    "mayor/replacement.webp", "city_treasurer/current.webp",
  ])
  assert.equal(queriedTables.includes("franchise_card_signatories"), false)
  assert.equal(application.status, "granted")
  assert.equal(franchise.mtop_number, "TEST-1")
})
