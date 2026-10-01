/**
 * The seven MTOP application forms, laid out two to an A4 page.
 *
 * The office's originals are one form to a portrait sheet, each with a
 * Tracker / Received By / Date Posted block along the bottom for franchise
 * staff. Those blocks are gone — the system tracks all of that now — and what
 * is left is redrawn to fit half an A4 portrait page, so one press yields two
 * forms to cut apart along the dashed line.
 *
 * Like the Confirmation Slip this is a form, not a coordinate map: every rule
 * is a flex child, so wording changes stretch a line instead of breaking the
 * page. Set in Arial, which every machine that prints it has.
 */

/** A4, portrait. A hair under 297mm so rounding never spills a blank page. */
const SHEET_W = "210mm"
const SHEET_H = "296.5mm"
/** Printers will not reach the very edge; keep ink off the outer margin. */
const MARGIN_OUTER = 26
/** Between the two copies — each side of the cut line. */
const MARGIN_CUT = 10

const SANS = "Arial, Helvetica, sans-serif"

export const APPLICATION_FORM_TYPES = [
  "new-franchise",
  "renewal",
  "change-of-ownership",
  "change-unit",
  "closure",
  "reissuance",
  "confirmation-slip",
] as const

export type ApplicationFormType = (typeof APPLICATION_FORM_TYPES)[number]

interface Field {
  label: string
  /** Share of the row. Labels are measured out of it, so the rule gets what is left. */
  grow?: number
}

type Block =
  | { kind: "row"; fields: Field[] }
  | { kind: "heading"; text: string }
  | { kind: "checks"; label?: string; options: string[] }
  | { kind: "box"; title?: string; blocks: Block[] }
  | { kind: "pair"; left: Block; right: Block }
  | { kind: "ruled" }
  | { kind: "signature" }
  | { kind: "statements" }

interface FormDefinition {
  title: string
  /** Sparse forms get taller rows so the sheet is filled, not left bare. */
  rowHeight: number
  blocks: Block[]
}

const row = (...labels: (string | Field)[]): Block => ({
  kind: "row",
  fields: labels.map((l) => (typeof l === "string" ? { label: l } : l)),
})

/**
 * What each form asks for is what the system records for that transaction —
 * see createNewFranchiseApplication / createFranchiseTransaction. The paper
 * forms' extras (cab type, driver birthdate and licence expiry, colour, year
 * model, MV file no., amounts and ORs) are not stored anywhere, and the fees
 * are priced by the assessor later, so they are not asked for here.
 *
 * "Cab No." on the paper forms is the body number in the system.
 */

/**
 * Each copy is wide and short — about 21 x 14.8 cm — so related fields share a
 * line (three across for the unit numbers) instead of stacking one to a row.
 */

/** The driver is entered at verification, but the applicant supplies it. */
const driverBlocks: Block[] = [
  row({ label: "Driver’s Name:", grow: 1.5 }, "Driver’s License No.:"),
  row("Address:"),
]

/** A new franchise has no MTOP number yet — it is issued on grant. */
const newUnitBox: Block = {
  kind: "box",
  title: "Unit Described as Follows:",
  blocks: [
    row("Body No.:", "Plate No.:"),
    row("MAKE:", "Route:"),
    row("Motor/Engine No.:", "Chassis No.:"),
  ],
}

/** An existing franchise: same box, with the MTOP number it already holds. */
const unitBox: Block = {
  kind: "box",
  title: "Unit Described as Follows:",
  blocks: [
    row("Body No.:", "MTOP No.:", "Plate No.:"),
    row("MAKE:", "Route:"),
    row("Motor/Engine No.:", "Chassis No.:"),
  ],
}

const FORMS: Record<ApplicationFormType, FormDefinition> = {
  "new-franchise": {
    title: "NEW FRANCHISE",
    rowHeight: 22,
    blocks: [
      row("Application Date:", "Contact Number:"),
      row("Applicant Name:"),
      row("Address:"),
      ...driverBlocks,
      newUnitBox,
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  renewal: {
    title: "RENEWAL OF FRANCHISE",
    rowHeight: 22,
    blocks: [
      row("Application Date:", "Contact Number:"),
      row("Operator:"),
      row("Address:"),
      ...driverBlocks,
      unitBox,
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  "change-of-ownership": {
    title: "CHANGE OF OWNERSHIP",
    rowHeight: 18,
    blocks: [
      row("Application Date:", "Driver’s License No.:"),
      row("Driver’s Name:"),
      row("Address:"),
      {
        kind: "pair",
        left: {
          kind: "box",
          title: "CURRENT OWNER:",
          blocks: [row("Full Name:"), row("Body No.:"), row("Contact Number:")],
        },
        right: {
          kind: "box",
          title: "NEW OWNER:",
          blocks: [row("Full Name:"), row("Body No.:"), row("Contact Number:")],
        },
      },
      unitBox,
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  "change-unit": {
    title: "MOTOR VEHICLE CHANGE UNIT",
    rowHeight: 26,
    blocks: [
      row("Application Date:", "MTOP No.:"),
      row("Applicant Name:"),
      { kind: "heading", text: "UNIT DESCRIPTION" },
      {
        kind: "pair",
        left: {
          kind: "box",
          title: "OLD",
          blocks: [
            row("MAKE:"),
            row("Plate No.:"),
            row("Motor/Engine No.:"),
            row("Chassis No.:"),
          ],
        },
        right: {
          kind: "box",
          title: "NEW",
          blocks: [
            row("MAKE:"),
            row("Plate No. (if changed):"),
            row("Motor/Engine No.:"),
            row("Chassis No.:"),
          ],
        },
      },
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  closure: {
    title: "CLOSURE OF FRANCHISE",
    rowHeight: 19,
    blocks: [
      row("Application Date:", "MTOP No.:"),
      row("Applicant Name:"),
      row({ label: "Address:", grow: 1.5 }, "Contact Number:"),
      row("Body No.:", "Plate No.:"),
      { kind: "heading", text: "REASON:" },
      {
        kind: "checks",
        options: [
          "BIR Clearance",
          "LTO (For Change Classification From Tricycle back to Private)",
          "Others",
        ],
      },
      { kind: "ruled" },
      { kind: "heading", text: "UNIT DESCRIPTION" },
      row("MAKE:", "Motor/Engine No.:", "Chassis No.:"),
      { kind: "signature" },
    ],
  },
  reissuance: {
    title: "RE-ISSUANCE OF FRANCHISE",
    rowHeight: 18,
    blocks: [
      row("Application Date:", "MTOP No.:", "Body No.:"),
      row("Requester’s Name:"),
      row({ label: "Address:", grow: 1.5 }, "Contact Number:"),
      { kind: "heading", text: "REASON:" },
      {
        kind: "checks",
        options: ["Closure", "LTO Clearance", "BIR Clearance", "Others"],
      },
      { kind: "ruled" },
      { kind: "signature" },
    ],
  },
  "confirmation-slip": {
    title: "CONFIRMATION SLIP",
    rowHeight: 18,
    blocks: [
      row("Application Date:", "MTOP No.:"),
      row("Applicant Name:"),
      row({ label: "Address:", grow: 1.5 }, "Contact Number:"),
      { kind: "heading", text: "REASON:" },
      {
        kind: "checks",
        options: ["BIR Clearance", "To Renew Expired LTO O.R. Registration", "Others"],
      },
      { kind: "ruled" },
      { kind: "signature" },
    ],
  },
}

export const APPLICATION_FORM_TITLES = APPLICATION_FORM_TYPES.map((type) => ({
  type,
  title: FORMS[type].title,
}))

const STATEMENTS = [
  "That the applicant is financially capable of maintaining the operation of the proposed motorcab / tri-wheeler service.",
  "That the applicant is willing and ready to comply with the ordinances, resolutions, rules and regulations imposed by the City Government of Ozamiz.",
  "The public necessity and convenience demand the immediate approval of this application.",
  "WHEREFORE, IT IS MOST RESPECTFULLY prayed unto His Honor, the City Mayor that the aforementioned application be issued a Motorized Tricycle Operator’s Permit to operate a motorcab / tri-wheeler service in the route applied for.",
]

/** Rules and box strokes. Thin enough to write across, heavy enough to photocopy. */
const RULE = "0.6pt solid #000"
const BOX = "0.9pt solid #000"

function Check({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: "3pt",
        lineHeight: 1.15,
      }}
    >
      <span
        style={{
          flex: "none",
          width: "7pt",
          height: "7pt",
          marginTop: "0.5pt",
          border: BOX,
        }}
      />
      <span>{text}</span>
    </span>
  )
}

function Row({ fields, height }: { fields: Field[]; height: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "7pt" }}>
      {fields.map((f) => (
        <div
          key={f.label}
          style={{
            flex: `${f.grow ?? 1} 1 0`,
            minWidth: 0,
            height: `${height}pt`,
            display: "flex",
            alignItems: "flex-end",
            gap: "2.5pt",
          }}
        >
          <span style={{ whiteSpace: "nowrap", fontWeight: 700, lineHeight: 1.2 }}>
            {f.label}
          </span>
          <span style={{ flex: 1, minWidth: "8pt", borderBottom: RULE, height: "1pt" }} />
        </div>
      ))}
    </div>
  )
}

function RenderBlock({
  block,
  rowHeight,
  inBox = false,
  fill = false,
}: {
  block: Block
  rowHeight: number
  inBox?: boolean
  /** A box in a pair shares the row's width; a lone one keeps its own height. */
  fill?: boolean
}) {
  switch (block.kind) {
    case "row":
      return <Row fields={block.fields} height={rowHeight} />

    case "heading":
      return (
        <div style={{ fontWeight: 700, fontSize: "9.5pt", marginTop: "2pt" }}>
          {block.text}
        </div>
      )

    case "checks":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "3pt 10pt",
            paddingLeft: inBox ? 0 : "6pt",
            fontWeight: 700,
          }}
        >
          {block.label && <span>{block.label}</span>}
          {block.options.map((o) => (
            <Check key={o} text={o} />
          ))}
        </div>
      )

    case "box":
      return (
        <div
          style={{
            border: BOX,
            padding: "4pt 7pt 3pt",
            display: "flex",
            flexDirection: "column",
            gap: "1pt",
            flex: fill ? 1 : "none",
            minWidth: 0,
          }}
        >
          {block.title && (
            <div style={{ fontWeight: 700, fontSize: "9.5pt" }}>{block.title}</div>
          )}
          {block.blocks.map((b, i) => (
            <RenderBlock key={i} block={b} rowHeight={rowHeight - 1} inBox />
          ))}
        </div>
      )

    case "pair":
      return (
        <div style={{ display: "flex", gap: "8pt", alignItems: "stretch" }}>
          <RenderBlock block={block.left} rowHeight={rowHeight} fill />
          <RenderBlock block={block.right} rowHeight={rowHeight} fill />
        </div>
      )

    case "ruled":
      // The writing area soaks up whatever height the sheet has left over, so
      // the sparse forms end where the dense ones do.
      return (
        <div
          style={{
            flex: 1,
            minHeight: "56pt",
            border: BOX,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-evenly",
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ borderBottom: RULE, margin: "0 5pt" }} />
          ))}
        </div>
      )

    case "signature":
      return (
        <div style={{ marginTop: "auto", paddingTop: "22pt" }}>
          <div style={{ width: "70%", margin: "0 auto", borderTop: RULE }} />
          <div
            style={{
              textAlign: "center",
              fontWeight: 700,
              fontSize: "7.5pt",
              paddingTop: "2pt",
            }}
          >
            APPLICANT&rsquo;S SIGNATURE OVER PRINTED NAME
          </div>
        </div>
      )

    case "statements":
      return (
        <div style={{ fontSize: "6.8pt", lineHeight: 1.25, textAlign: "justify" }}>
          {STATEMENTS.map((s) => (
            <p key={s} style={{ margin: "0 0 1.5pt" }}>
              {s}
            </p>
          ))}
        </div>
      )
  }
}

function Letterhead({ title }: { title: string }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12pt",
          paddingBottom: "3pt",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "3pt" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo1.png" alt="" style={{ height: "30pt" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo2.png" alt="" style={{ height: "30pt" }} />
        </div>
        <div style={{ textAlign: "center", fontWeight: 700, lineHeight: 1.25 }}>
          <div style={{ fontSize: "8.5pt", fontWeight: 700 }}>
            Republic of the Philippines
          </div>
          <div style={{ fontSize: "10pt" }}>CITY GOVERNMENT OF OZAMIZ</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "3pt" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo3.png" alt="" style={{ height: "28pt" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo4.png" alt="" style={{ height: "23pt" }} />
        </div>
      </div>
      <div
        style={{
          padding: "5pt 0 3pt",
          textAlign: "center",
          fontWeight: 700,
          fontSize: "15pt",
          whiteSpace: "nowrap",
        }}
      >
        APPLICATION FORM : {title}
      </div>
    </div>
  )
}

/** One form, filling the half of the page it is given. */
function FormPanel({
  def,
  side,
}: {
  def: FormDefinition
  side: "top" | "bottom"
}) {
  return (
    <section
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "4pt",
        boxSizing: "border-box",
        padding:
          side === "top"
            ? `${MARGIN_OUTER - 6}pt ${MARGIN_OUTER}pt ${MARGIN_CUT}pt`
            : `${MARGIN_CUT}pt ${MARGIN_OUTER}pt ${MARGIN_OUTER - 6}pt`,
        // The cut line, printed across the middle so it needs no ruler.
        borderTop: side === "bottom" ? "0.5pt dashed #888" : undefined,
        // Its own stacking context, so the seal can sit behind the form's
        // writing without ever dropping behind the sheet's white.
        position: "relative",
        zIndex: 0,
        isolation: "isolate",
      }}
    >
      {/* Backdrop seal. Multiply drops the JPEG's white square into the paper,
          leaving only the seal, tinted back by the opacity so handwriting and
          photocopies stay legible over it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/city-seal.jpg"
        alt=""
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "250pt",
          height: "250pt",
          transform: "translate(-50%, -50%)",
          opacity: 0.12,
          mixBlendMode: "multiply",
          zIndex: -1,
          pointerEvents: "none",
        }}
      />
      <Letterhead title={def.title} />
      {def.blocks.map((b, i) => (
        <RenderBlock key={i} block={b} rowHeight={def.rowHeight} />
      ))}
    </section>
  )
}

/** The sheet: two identical copies of the chosen form, one above the other. */
export function ApplicationFormSheet({ type }: { type: ApplicationFormType }) {
  const def = FORMS[type]

  return (
    <div
      className="mtop-form-sheet"
      style={{
        display: "flex",
        flexDirection: "column",
        width: SHEET_W,
        height: SHEET_H,
        background: "#fff",
        color: "#000",
        fontFamily: SANS,
        fontSize: "8.5pt",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <FormPanel def={def} side="top" />
      <FormPanel def={def} side="bottom" />
    </div>
  )
}
