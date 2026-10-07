import { NextResponse, type NextRequest } from "next/server"
import { canViewPrintForms } from "@/lib/actions/print-forms"
import { isFormKind } from "@/lib/forms/print-data"
import { renderFormPdf } from "@/lib/forms/render-pdf"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  if (!(await canViewPrintForms())) {
    return new NextResponse("Not authorized to download forms", { status: 403 })
  }

  const { kind } = await params
  if (!isFormKind(kind)) {
    return new NextResponse("Form not found", { status: 404 })
  }

  // This is a server-owned origin; never navigate a headless browser to a
  // request-supplied Host while forwarding the user's authentication cookies.
  try {
    const baseUrl = new URL(
      process.env.MTOP_PDF_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
    )
    if (!["http:", "https:"].includes(baseUrl.protocol)) {
      throw new Error("Invalid PDF base URL configuration")
    }

    const pdf = await renderFormPdf({
      kind,
      baseUrl,
      cookies: request.cookies.getAll(),
    })
    const filenameKind = kind === "annual-confirmation" ? "confirmation" : kind
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="mtop-${filenameKind}-form.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("Failed to render printable form PDF", error)
    return new NextResponse(
      "PDF download is unavailable. Please use Print and Save as PDF.",
      { status: 503 }
    )
  }
}
