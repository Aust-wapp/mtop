import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { OperatorsTable } from "./operators-table"

export default function OperatorsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="MTOP Operators"
        subtitle="Granted MTOP records and their current franchise status"
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading MTOP operators...
          </div>
        }
      >
        <OperatorsTable />
      </Suspense>
    </div>
  )
}
