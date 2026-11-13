/* eslint @typescript-eslint/no-require-imports: "off" */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")
const sharp = require("sharp")

const source = fs.readFileSync("src/lib/signature-image.ts", "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText
const loaded = { exports: {} }
new Function("require", "module", "exports", compiled)(require, loaded, loaded.exports)
const { prepareOfficialSignature } = loaded.exports

function file(buffer, filename, type) {
  return new File([buffer], filename, { type })
}

test("JPG signatures are decoded and converted to private-bucket-compatible WebP", async () => {
  const jpeg = await sharp({
    create: { width: 340, height: 110, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).jpeg().toBuffer()

  for (const filename of ["sample.jpg", "sample.jpeg"]) {
    const prepared = await prepareOfficialSignature(file(jpeg, filename, "image/jpeg"))
    assert.equal(prepared.contentType, "image/webp")
    assert.equal(prepared.extension, "webp")
    assert.equal((await sharp(Buffer.from(prepared.bytes)).metadata()).format, "webp")
  }
})

test("PNG and WebP signatures remain supported without format changes", async () => {
  const image = sharp({
    create: { width: 320, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
  const png = await image.png().toBuffer()
  const webp = await sharp(png).webp().toBuffer()
  for (const [bytes, ext] of [[png, "png"], [webp, "webp"]]) {
    const prepared = await prepareOfficialSignature(file(bytes, `signature.${ext}`, `image/${ext}`))
    assert.equal(prepared.extension, ext)
    assert.equal(prepared.contentType, `image/${ext}`)
    assert.deepEqual(Buffer.from(prepared.bytes), bytes)
  }
})

test("spoofed JPEG and excessive input size are rejected", async () => {
  await assert.rejects(
    prepareOfficialSignature(file(Buffer.from("not really jpg"), "fake.jpg", "image/jpeg")),
    /valid PNG, JPG\/JPEG, or WebP/,
  )
  const png = await sharp({ create: { width: 15, height: 15, channels: 4, background: "#ffffff" } }).png().toBuffer()
  await assert.rejects(
    prepareOfficialSignature(file(png, "fake.jpg", "image/jpeg")),
    /valid PNG, JPG\/JPEG, or WebP/,
  )
  await assert.rejects(
    prepareOfficialSignature(file(new Uint8Array(2 * 1024 * 1024 + 1), "large.jpg", "image/jpeg")),
    /under 2 MB/,
  )
})

test("oversized dimensions are rejected even for a small JPEG file", async () => {
  const jpeg = await sharp({
    create: { width: 3100, height: 100, channels: 3, background: "#ffffff" },
  }).jpeg().toBuffer()
  await assert.rejects(
    prepareOfficialSignature(file(jpeg, "wide.jpg", "image/jpeg")),
    /Maximum: 3000 × 1000 pixels/,
  )
})

test("the signatory picker supports JPG and an initial click opens the chooser", () => {
  const control = fs.readFileSync("src/app/dashboard/admin/settings/signature-control.tsx", "utf8")
  assert.match(control, /accept="image\/png,image\/jpeg,image\/webp/)
  assert.match(control, /fileInputRef\.current\?\.click\(\)/)
  assert.doesNotMatch(control, /disabled=\{!file \|\| busy\}/)
  const actions = fs.readFileSync("src/lib/actions/signatures.ts", "utf8")
  assert.match(actions, /prepareOfficialSignature\(file\)/)
  assert.match(actions, /hasPermission\(supabase, user\.id, "admin\.manage"\)/)
})

test("signature selection uploads immediately and removal requires confirmation", () => {
  const control = fs.readFileSync("src/app/dashboard/admin/settings/signature-control.tsx", "utf8")
  assert.match(control, /if \(selected\) void save\(selected\)/)
  assert.match(control, /window\.confirm\(/)
  assert.match(control, /hasSignature \? "Replace signature" : "Upload signature"/)
  assert.doesNotMatch(control, /window\.location\.reload\(\)/)
})

test("signatory details save only their four settings keys", () => {
  const settings = fs.readFileSync("src/lib/actions/settings.ts", "utf8")
  assert.match(settings, /export async function updateSignatoryDetails/)
  assert.match(settings, /keys\.map\(\(key\) => \(\{ key, value: values\[key\]/)
  assert.doesNotMatch(settings.match(/export async function updateSignatoryDetails[\s\S]*?const DEFAULTS/)[0], /signature_path/)
})
