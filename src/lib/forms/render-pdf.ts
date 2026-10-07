import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import type { FormKind } from "@/lib/forms/print-data"

type BrowserCookie = { name: string; value: string }

function browserExecutablePath(): string {
  const candidates = [
    process.env.MTOP_PDF_BROWSER_PATH,
    process.platform === "win32"
      ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      : "/usr/bin/chromium",
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "/usr/bin/google-chrome",
  ]

  const executable = candidates.find(
    (candidate) => candidate && existsSync(candidate)
  )
  if (!executable) {
    throw new Error(
      "PDF browser unavailable. Set MTOP_PDF_BROWSER_PATH to a Chrome, Edge, or Chromium executable."
    )
  }
  return executable
}

/** Print the same protected HTML preview used by the browser's Print button. */
export async function renderFormPdf({
  kind,
  cookies,
  baseUrl,
  previewPath = "/print/forms",
}: {
  kind: FormKind
  cookies: BrowserCookie[]
  baseUrl: URL
  previewPath?: string
}): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: browserExecutablePath(),
    headless: true,
  })

  try {
    const context = await browser.newContext()
    if (cookies.length > 0) {
      await context.addCookies(
        cookies.map(({ name, value }) => ({
          name,
          value,
          url: baseUrl.origin,
          httpOnly: true,
        }))
      )
    }

    const page = await context.newPage()
    const previewUrl = new URL(`${previewPath}/${kind}`, baseUrl)
    const response = await page.goto(previewUrl.toString(), {
      waitUntil: "networkidle",
    })
    if (!response?.ok()) {
      throw new Error(`Print preview returned HTTP ${response?.status() ?? "unknown"}`)
    }
    if (new URL(page.url()).pathname !== previewUrl.pathname) {
      throw new Error("Print preview redirected instead of rendering the form")
    }

    await page.locator(".forms-sheet .application-paper").first().waitFor()
    const imagesLoaded = await page.locator(".paper-header img").evaluateAll((images) =>
      images.every(
        (image) =>
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth > 0
      )
    )
    if (!imagesLoaded) {
      throw new Error("An official form logo failed to load")
    }

    return await page.pdf({ preferCSSPageSize: true, printBackground: true })
  } finally {
    await browser.close()
  }
}
