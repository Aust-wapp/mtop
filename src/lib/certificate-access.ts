export interface ClosureApplicationCandidate {
  id: string
  status: string
  granted_at: string | null
  submitted_at?: string | null
  transaction_type?:
    | { code: string }
    | { code: string }[]
    | null
}

function transactionCode(
  transactionType: ClosureApplicationCandidate["transaction_type"]
): string | null {
  const type = Array.isArray(transactionType)
    ? transactionType[0]
    : transactionType

  return type?.code ?? null
}

export function findLatestGrantedClosureApplication(
  applications: readonly ClosureApplicationCandidate[]
): ClosureApplicationCandidate | null {
  const grantedClosures = applications
    .filter(
      (application) =>
        application.status === "granted" &&
        transactionCode(application.transaction_type) === "closure"
    )
    .slice()
    .sort((left, right) => {
      const leftDate = left.granted_at ?? left.submitted_at ?? ""
      const rightDate = right.granted_at ?? right.submitted_at ?? ""
      return rightDate.localeCompare(leftDate)
    })

  return grantedClosures[0] ?? null
}
