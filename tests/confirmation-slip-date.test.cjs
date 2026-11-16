/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")

function loadTS(path, mockedRequire = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  new Function("require", "module", "exports", code)(
    (id) => Object.hasOwn(mockedRequire, id) ? mockedRequire[id] : require(id),
    mod, mod.exports
  )
  return mod.exports
}

const office = loadTS("src/lib/office-time.ts")
const { confirmationSlipGivenDate } = loadTS("src/lib/confirmation-slip-date.ts", {
  "@/lib/office-time": office,
})
const format = (iso) => confirmationSlipGivenDate(new Date(iso))

test("Given this uses current Asia/Manila day, not the historical grant date", () => {
  assert.deepEqual(format("2026-11-16T00:00:00.000Z"), {
    givenDay: "16", givenOrdinal: "th", givenMonth: "November", givenYear: "2026",
  })
  assert.deepEqual(format("2026-10-29T16:00:00.000Z"), {
    givenDay: "30", givenOrdinal: "th", givenMonth: "October", givenYear: "2026",
  })
})

test("Ozamiz midnight boundary is applied even when server runs in UTC", () => {
  assert.deepEqual(format("2026-11-15T15:59:59Z"), {
    givenDay: "15", givenOrdinal: "th", givenMonth: "November", givenYear: "2026",
  })
  assert.deepEqual(format("2026-11-15T16:00:00Z"), {
    givenDay: "16", givenOrdinal: "th", givenMonth: "November", givenYear: "2026",
  })
  assert.deepEqual(format("2026-12-31T16:00:00Z"), {
    givenDay: "1", givenOrdinal: "st", givenMonth: "January", givenYear: "2027",
  })
})

test("English ordinal suffixes include 11th-13th exceptions", () => {
  for (const [day,suffix] of [[1,"st"],[2,"nd"],[3,"rd"],[11,"th"],[12,"th"],[13,"th"],[21,"st"],[22,"nd"],[23,"rd"],[30,"th"],[31,"st"]]) {
    const instant = new Date(Date.UTC(2026, 9, day, 6))
    const date = confirmationSlipGivenDate(instant)
    assert.equal(date.givenOrdinal, suffix, String(day))
  }
})

test("Confirmation Slip date is generated on each server request, not written to the application", () => {
  const source = fs.readFileSync("src/lib/actions/confirmation-slip.ts", "utf8")
  assert.match(source, /\.\.\.confirmationSlipGivenDate\(\)/)
  assert.doesNotMatch(source, /grantedParts\(application\.date_issued/)
  const view = fs.readFileSync("src/components/mtop/confirmation-slip.tsx", "utf8")
  for(const field of ["givenDay", "givenOrdinal", "givenMonth", "givenYear"]) {
    assert.match(view, new RegExp(`data\\.${field}`))
  }
  assert.match(view, /<Sheet data=\{data\} copyLabel=\{COPY_LABEL\} \/>/)
  assert.match(view, /<Sheet data=\{data\} \/>/)
})
