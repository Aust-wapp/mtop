/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")

const action = fs.readFileSync("src/lib/actions/confirmation-slip.ts", "utf8")
const slip = fs.readFileSync("src/components/mtop/confirmation-slip.tsx", "utf8")
const settings = fs.readFileSync("src/lib/actions/settings.ts", "utf8")
const signatures = fs.readFileSync("src/lib/actions/signatures.ts", "utf8")

test("Confirmation Slip resolves current Mayor name and designation from saved settings", () => {
  assert.match(action, /getSystemSettings\(\)/)
  assert.match(action, /mayorName: settings\.mayor_name/)
  assert.match(action, /mayorDesignation: settings\.mayor_designation/)
  assert.match(action, /mayorSignatureUrl: string \| null/)
  assert.match(slip, /\{data\.mayorName \|\|/)
  assert.match(slip, /\{data\.mayorDesignation \|\| "City Mayor"\}/)
  assert.doesNotMatch(slip, /const MAYOR_TITLE\s*=/)
})

test("Confirmation Slip authorizes access and signs its private Mayor image path", () => {
  assert.match(action, /hasPermission\(supabase, user\.id, "application\.view"\)/)
  assert.match(action, /settings\.mayor_signature_path/)
  assert.match(action, /\.from\("mtop-signatures"\)[\s\S]*?\.createSignedUrl\(settings\.mayor_signature_path, 300\)/)
  assert.match(action, /if \(signatureError\) return \{ error:/)
  assert.match(slip, /\{data\.mayorSignatureUrl && \(/)
})

test("Approval signature overlays the printed Mayor name but keeps designation legible", () => {
  assert.match(slip, /alt="City Mayor signature"/)
  assert.match(slip, /top: "20pt"/)
  assert.match(slip, /height: "48pt"/)
  assert.match(slip, /mixBlendMode: "multiply"/)
  assert.match(slip, /pointerEvents: "none"/)
  assert.match(slip, /zIndex: 2/)
  assert.match(slip, /<div style=\{\{ height: "54pt", position: "relative" \}\}>/)
})

test("Both confirmation copies use identical saved Mayor signature fields", () => {
  assert.match(slip, /<Sheet data=\{data\} copyLabel=\{COPY_LABEL\} \/>/)
  assert.match(slip, /<Sheet data=\{data\} \/>/)
  assert.match(settings, /revalidatePath\("\/print\/confirmation", "layout"\)/)
  assert.match(signatures, /revalidatePath\("\/print\/confirmation", "layout"\)/)
})
