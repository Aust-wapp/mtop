/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/card-pdf-images.ts"), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const loaded = { exports: {} }
new Function("module", "exports", compiled)(loaded, loaded.exports)
const { refreshCardSignatureImages } = loaded.exports

test("PDF export refreshes both expiring signature URLs before capture", async () => {
  const mayor = { src: "old-mayor", decode: async () => { assert.equal(mayor.src, "new-mayor") } }
  const treasurer = { src: "old-treasurer", decode: async () => { assert.equal(treasurer.src, "new-treasurer") } }
  const card = {
    querySelector: (selector) => selector.includes("Mayor") ? mayor : treasurer,
  }

  await refreshCardSignatureImages(card, {
    mayorSignatureUrl: "new-mayor",
    treasurerSignatureUrl: "new-treasurer",
  })
  assert.equal(mayor.crossOrigin, "anonymous")
  assert.equal(treasurer.crossOrigin, "anonymous")
})

test("PDF export fails when a refreshed signature cannot be displayed", async () => {
  const card = { querySelector: () => null }
  await assert.rejects(
    refreshCardSignatureImages(card, { mayorSignatureUrl: "new-mayor", treasurerSignatureUrl: null }),
    /missing from the card preview/
  )
})

test("PDF export skips absent signatures", async () => {
  const card = { querySelector: () => { throw new Error("unexpected lookup") } }
  await refreshCardSignatureImages(card, { mayorSignatureUrl: null, treasurerSignatureUrl: null })
})
