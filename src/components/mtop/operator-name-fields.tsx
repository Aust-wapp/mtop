"use client"

import { useState } from "react"
import type { UseFormRegisterReturn } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { OperatorNameParts } from "@/lib/operator-name"

type Part = "last" | "first" | "middle" | "suffix"

const PARTS: {
  part: Part
  key: keyof OperatorNameParts
  label: string
  placeholder: string
}[] = [
  { part: "last", key: "last_name", label: "Last Name", placeholder: "Dela Cruz" },
  { part: "first", key: "first_name", label: "First Name", placeholder: "Juan" },
  { part: "middle", key: "middle_name", label: "Middle Name (optional)", placeholder: "Perez" },
  { part: "suffix", key: "suffix", label: "Suffix (optional)", placeholder: "Jr." },
]

/**
 * The operator's name as four inputs — last, first, middle, suffix. The server
 * action composes them into the one applicant_name line the rest of the system
 * reads (composeOperatorName in src/lib/operator-name.ts).
 *
 * `onNameChange` hands back all four parts whenever one changes, for the
 * one-franchise-per-operator check that runs while the clerk types. Tracked
 * off register()'s own onChange rather than watch(), which React Compiler
 * refuses to memoize around.
 */
export function OperatorNameFields({
  idPrefix = "",
  labelPrefix = "",
  fields,
  errors,
  onNameChange,
}: {
  idPrefix?: string
  labelPrefix?: string
  fields: Record<Part, UseFormRegisterReturn>
  errors: Partial<Record<Part, string | undefined>>
  onNameChange?: (parts: OperatorNameParts) => void
}) {
  const [parts, setParts] = useState<OperatorNameParts>({
    last_name: "",
    first_name: "",
    middle_name: "",
    suffix: "",
  })
  const suffixListId = `${idPrefix}suffix-options`

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_7rem]">
      {PARTS.map(({ part, key, label, placeholder }) => {
        const field = fields[part]
        const id = `${idPrefix}${key}`
        const error = errors[part]
        return (
          <div key={part} className="space-y-2">
            <Label htmlFor={id}>
              {labelPrefix}
              {label}
            </Label>
            <Input
              id={id}
              placeholder={placeholder}
              autoComplete="off"
              list={part === "suffix" ? suffixListId : undefined}
              {...field}
              onChange={(e) => {
                field.onChange(e)
                const next = { ...parts, [key]: e.target.value }
                setParts(next)
                onNameChange?.(next)
              }}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )
      })}
      <datalist id={suffixListId}>
        {["Jr.", "Sr.", "II", "III", "IV"].map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
