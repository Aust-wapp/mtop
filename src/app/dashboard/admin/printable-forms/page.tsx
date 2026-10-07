import Link from "next/link"
import { Printer } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { APPLICATION_FORM_TITLES } from "@/components/mtop/application-form-sheet"
import { cn } from "@/lib/utils"
import { isAdmin } from "@/lib/require-admin"

const DESCRIPTIONS: Record<string, string> = {
  "new-franchise": "For an operator registering a tricycle that has no franchise yet.",
  renewal: "For an operator renewing the permit of an existing franchise.",
  "change-of-ownership": "For transferring a franchise from the current owner to a new one.",
  "change-unit": "For replacing the motor vehicle behind an existing franchise.",
  closure: "For surrendering a franchise.",
  reissuance: "For a replacement copy of a lost or damaged permit.",
  "confirmation-slip": "For the LTO confirmation of a franchise, with any penalty paid.",
}

export default async function PrintableFormsPage() {
  if (!(await isAdmin())) {
    return (
      <div className="space-y-2 py-12 text-center">
        <h1 className="text-lg font-semibold">Printable Forms unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Only an administrator can open this page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Printable Forms"
        subtitle="Blank forms for the counter. Each sheet prints one form on A4 (portrait)."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {APPLICATION_FORM_TITLES.map(({ type, title }) => (
          <Card key={type}>
            <CardContent className="flex h-full flex-col justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  {DESCRIPTIONS[type]}
                </p>
              </div>
              <Link
                href={`/print/application-form/${type}`}
                target="_blank"
                className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
              >
                <Printer className="h-4 w-4" />
                Open print sheet
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
