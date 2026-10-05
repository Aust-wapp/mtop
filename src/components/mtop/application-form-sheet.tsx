/**
 * The seven MTOP application forms, one to an A4 page.
 *
 * The office's originals are one form to a portrait sheet, each with a
 * Tracker / Received By / Date Posted block along the bottom for franchise
 * staff. Those blocks are gone — the system tracks all of that now — and what
 * is left is typeset the way a printed form is: compact fields on a common
 * grid, thin rules, thin boxes, and whatever is left of the page left blank
 * rather than stretched over.
 *
 * Every form is a list of blocks (field grids, boxes, the reason block, the
 * signature, the legal text) drawn by the same few components below, so the
 * seven read as one family. Fields sit on a CSS grid whose label columns size
 * themselves to their longest label, which keeps every rule starting at the
 * same place without measuring anything. Set in Arial, which every machine that
 * prints it has.
 */

/** A4, portrait. A hair under 297mm so rounding never spills a blank page. */
const SHEET_W = "210mm"
const SHEET_H = "296.5mm"
/** Printers will not reach the very edge; keep ink off the outer margin. */
const MARGIN_X = "16mm"
const MARGIN_TOP = "11mm"
const MARGIN_BOTTOM = "12mm"

const SANS = "Arial, Helvetica, sans-serif"

/** Rules and box strokes: one weight, thin enough to write across, dark enough to photocopy. */
const STROKE = "0.75pt solid #000"

/** Type sizes, in pt. */
const FONT = {
  body: 10.5,
  small: 8.5,
  statement: 9,
  heading: 11,
  title: 16,
}

/** Section headings: REASON, box and panel titles. One treatment so they read as one rank. */
const HEADING = { fontWeight: 700, fontSize: `${FONT.heading}pt`, lineHeight: 1.2 } as const

/** One writing line, from rule to rule. */
const PITCH = 25
/** Space between blocks on the page. */
const BLOCK_GAP = 11
/** Space between the groups inside one field grid. */
const GROUP_GAP = 9

/**
 * The first label column never gets narrower than this, so on every form the
 * rules start at the same place however short its labels are. It is a little
 * wider than the longest label that shares a column with the rest.
 */
const LABEL_MIN = 111
/** The second label column of a two-up row. */
const LABEL_MIN_RIGHT = 88
/** Space left between one field's rule and the next field's label. */
const CELL_GAP = 18
/** Space between a label and its rule. */
const LABEL_GAP = 5
/** A box's side padding plus its border, so a boxed rule starts where an unboxed one does. */
const BOX_INSET = 8 + 0.75

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

/**
 * A line of the form: one, two or three fields side by side. A lone field runs
 * the full width unless it is `short`, which stops it at the end of the first
 * column. `own` sets a label too long for the label column on a line of its
 * own, so it does not push every other rule across with it.
 */
type Row =
  | { labels: string[]; short?: boolean; own?: boolean }
  | "gap"

interface Panel {
  title: string
  rows: Row[]
}

type Block =
  | { kind: "fields"; rows: Row[]; labelMin?: number }
  | { kind: "box"; title: string; rows: Row[]; labelMin?: number; spaceBefore?: number }
  | { kind: "compare"; left: Panel; right: Panel }
  | { kind: "reason"; options: string[] }
  | { kind: "signature" }
  | { kind: "statements" }

interface FormDefinition {
  title: string
  blocks: Block[]
}

const row = (...labels: string[]): Row => ({ labels })
const half = (label: string): Row => ({ labels: [label], short: true })
const own = (label: string): Row => ({ labels: [label], own: true })

/**
 * What each form asks for is what the system records for that transaction —
 * see createNewFranchiseApplication / createFranchiseTransaction. The paper
 * forms' extras (cab type, driver birthdate and licence expiry, colour, year
 * model, MV file no., amounts and ORs) are not stored anywhere, and the fees
 * are priced by the assessor later, so they are not asked for here.
 *
 * "Cab No." on the paper forms is the body number in the system.
 */

/** The driver is entered at verification, but the applicant supplies it. */
const driverRows: Row[] = [
  "gap",
  row("Driver’s Name:"),
  row("Address:"),
  half("Driver’s License No.:"),
]

/** A new franchise has no MTOP number yet — it is issued on grant. */
const newUnitBox: Block = {
  kind: "box",
  title: "Unit Described as Follows:",
  rows: [
    row("Body/Cab No.:", "Plate No.:"),
    row("MAKE:"),
    row("Route:"),
    row("Motor/Engine No.:"),
    row("Chassis No.:"),
  ],
}

/** An existing franchise: same box, with the MTOP number it already holds. */
const unitBox: Block = {
  kind: "box",
  title: "Unit Described as Follows:",
  rows: [
    row("Body/Cab No.:", "MTOP No.:"),
    half("Plate No.:"),
    row("MAKE:"),
    row("Route:"),
    row("Motor/Engine No.:"),
    row("Chassis No.:"),
  ],
}

const FORMS: Record<ApplicationFormType, FormDefinition> = {
  "new-franchise": {
    title: "NEW FRANCHISE",
    blocks: [
      {
        kind: "fields",
        rows: [
          row("Application Date:", "Contact Number:"),
          row("Applicant’s Name:"),
          row("Address:"),
          ...driverRows,
        ],
      },
      newUnitBox,
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  renewal: {
    title: "RENEWAL OF FRANCHISE",
    blocks: [
      {
        kind: "fields",
        rows: [
          row("Application Date:", "Contact Number:"),
          row("Applicant’s Name:"),
          row("Address:"),
          ...driverRows,
        ],
      },
      unitBox,
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  // A change of ownership only happens when the owner has died and a relative
  // succeeds to the franchise, so the form names the deceased, the successor
  // and how they are related. There is no unit box — the unit does not change —
  // and no contact number for the deceased.
  "change-of-ownership": {
    title: "CHANGE OF OWNERSHIP",
    blocks: [
      {
        kind: "fields",
        labelMin: 118,
        rows: [
          row("Application Date:", "MTOP No.:"),
          row("Applicant’s Name:"),
          row("Address:"),
          half("Contact Number:"),
        ],
      },
      {
        kind: "box",
        title: "CURRENT OWNER (DECEASED):",
        labelMin: 118,
        rows: [row("Full Name:"), row("Date of Death:"), row("Body/Cab No.:"), row("Plate No.:")],
      },
      {
        kind: "box",
        title: "NEW OWNER (SUCCESSOR):",
        labelMin: 118,
        rows: [
          row("Full Name:"),
          own("Relationship to Deceased Owner:"),
          row("Contact Number:"),
          row("Address:"),
          row("Driver’s License No.:"),
        ],
      },
      { kind: "signature" },
      { kind: "statements" },
    ],
  },
  "change-unit": {
    title: "MOTOR VEHICLE CHANGE UNIT",
    blocks: [
      {
        kind: "fields",
        rows: [row("Application Date:", "MTOP No.:"), row("Applicant’s Name:")],
      },
      {
        kind: "compare",
        left: {
          title: "OLD",
          rows: [row("MAKE:"), row("Plate No.:"), row("Motor/Engine No.:"), row("Chassis No.:")],
        },
        right: {
          title: "NEW",
          rows: [
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
    blocks: [
      {
        kind: "fields",
        rows: [
          half("Application Date:"),
          row("Applicant’s Name:"),
          row("MTOP No.:", "Body/Cab No.:"),
          row("Address:"),
          row("Contact Number:", "Plate No.:"),
        ],
      },
      {
        kind: "reason",
        options: [
          "BIR Clearance",
          "LTO (For Change Classification From Tricycle back to Private)",
          "Others",
        ],
      },
      {
        kind: "box",
        title: "UNIT DESCRIPTION",
        spaceBefore: 6,
        rows: [row("MAKE:"), row("Motor/Engine No.:"), row("Chassis No.:")],
      },
      { kind: "signature" },
    ],
  },
  reissuance: {
    title: "RE-ISSUANCE OF FRANCHISE",
    blocks: [
      {
        kind: "fields",
        rows: [
          half("Application Date:"),
          row("Applicant’s Name:"),
          row("MTOP No.:", "Body/Cab No.:"),
          row("Address:"),
          half("Contact Number:"),
        ],
      },
      { kind: "reason", options: ["Closure", "LTO Clearance", "BIR Clearance", "Others"] },
      { kind: "signature" },
    ],
  },
  "confirmation-slip": {
    title: "CONFIRMATION SLIP",
    blocks: [
      {
        kind: "fields",
        rows: [
          row("Application Date:", "MTOP No.:"),
          row("Applicant’s Name:"),
          row("Address:"),
          half("Contact Number:"),
        ],
      },
      {
        kind: "reason",
        options: ["BIR Clearance", "To Renew Expired LTO O.R. Registration", "Others"],
      },
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

/** A field label. A parenthetical note ("(if changed)") is set lighter so it does not outweigh the name. */
function Label({ text }: { text: string }) {
  const m = /^(.*?)( \([^)]*\))(:?)$/.exec(text)
  if (!m) return <>{text}</>
  return (
    <>
      {m[1]}
      <span style={{ fontWeight: 400, fontSize: `${FONT.small}pt` }}>{m[2]}</span>
      {m[3]}
    </>
  )
}

const labelStyle = {
  display: "flex",
  alignItems: "flex-end",
  boxSizing: "border-box",
  height: `${PITCH}pt`,
  whiteSpace: "nowrap",
  fontWeight: 700,
  lineHeight: 1.1,
} as const

/** A writing line the width of its cell. */
function Rule({ column }: { column: string }) {
  return (
    <div
      style={{
        gridColumn: column,
        boxSizing: "border-box",
        height: `${PITCH}pt`,
        borderBottom: STROKE,
      }}
    />
  )
}

/**
 * Label-and-rule fields on a grid: a label column and a rule column for each
 * field across a line. Every line of a grid shares its columns, so the rules
 * start together; a line with fewer fields lets its last rule run on.
 */
function FieldGrid({
  rows,
  labelMin = LABEL_MIN,
  pitchScale = 1,
}: {
  rows: Row[]
  labelMin?: number
  pitchScale?: number
}) {
  const across = Math.max(1, ...rows.map((r) => (r === "gap" || r.own ? 1 : r.labels.length)))
  const columns = Array.from({ length: across }, (_, i) => {
    const min = i === 0 ? labelMin : across === 2 ? LABEL_MIN_RIGHT : 0
    return `minmax(${min}pt, max-content) minmax(0, 1fr)`
  }).join(" ")
  const pitch = PITCH * pitchScale

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: rows.map((r) => (r === "gap" ? `${GROUP_GAP}pt` : `${pitch}pt`)).join(" "),
        fontSize: `${FONT.body}pt`,
      }}
    >
      {rows.map((r, y) => {
        if (r === "gap") {
          return <div key={y} style={{ gridColumn: "1 / -1", height: `${GROUP_GAP}pt`, alignSelf: "start" }} />
        }
        if (r.own) {
          // A line of its own: label, then a rule for the rest of the line.
          return (
            <div key={y} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-end", height: `${pitch}pt` }}>
              <span style={{ ...labelStyle, height: "auto", paddingRight: `${LABEL_GAP}pt` }}>
                <Label text={r.labels[0]} />
              </span>
              <span style={{ flex: 1, minWidth: 0, height: `${pitch}pt`, boxSizing: "border-box", borderBottom: STROKE }} />
            </div>
          )
        }
        return r.labels.map((label, x) => {
          const last = x === r.labels.length - 1
          const ruleEnd = last && !r.short ? "-1" : String(x * 2 + 3)
          return [
            <div
              key={`${y}-${x}-l`}
              style={{
                ...labelStyle,
                height: `${pitch}pt`,
                gridColumn: String(x * 2 + 1),
                paddingLeft: x > 0 ? `${CELL_GAP}pt` : 0,
                paddingRight: `${LABEL_GAP}pt`,
              }}
            >
              <span>
                <Label text={label} />
              </span>
            </div>,
            <Rule key={`${y}-${x}-r`} column={`${x * 2 + 2} / ${ruleEnd}`} />,
          ]
        })
      })}
    </div>
  )
}

/** A printable check box: a drawn square, not the browser's, so it prints the same everywhere. */
function CheckBox() {
  return (
    <span
      style={{
        flex: "none",
        width: "9pt",
        height: "9pt",
        marginTop: "1pt",
        boxSizing: "border-box",
        border: STROKE,
      }}
    />
  )
}

/** Reason options stacked top to bottom, then three writing lines for anything to add. */
function Reason({ options }: { options: string[] }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: `${FONT.heading}pt` }}>REASON:</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "5pt",
          padding: "6pt 0 6pt 14pt",
          fontSize: `${FONT.body}pt`,
        }}
      >
        {options.map((o) => (
          <div key={o} style={{ display: "flex", alignItems: "flex-start", gap: "7pt", lineHeight: 1.25 }}>
            <CheckBox />
            <span>{o}</span>
          </div>
        ))}
      </div>
      {/* Three writing lines, no frame around them. */}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} style={{ height: `${PITCH}pt`, borderBottom: STROKE }} />
      ))}
    </div>
  )
}

function Box({
  title,
  rows,
  labelMin = LABEL_MIN,
}: {
  title: string
  rows: Row[]
  labelMin?: number
}) {
  return (
    <section style={{ border: STROKE, padding: "7pt 8pt 7pt" }}>
      <div style={{ ...HEADING, paddingBottom: "2pt" }}>
        {title}
      </div>
      {/* The box is inset, so its labels give back the inset and the rules still line up with the page's. */}
      <FieldGrid rows={rows} labelMin={labelMin - BOX_INSET} />
    </section>
  )
}

/** Old and new side by side in one frame, split down the middle. */
function Compare({ left, right }: { left: Panel; right: Panel }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: STROKE }}>
      {[left, right].map((p, i) => (
        <div
          key={p.title}
          style={{
            minWidth: 0,
            padding: "7pt 8pt 7pt",
            borderLeft: i === 1 ? STROKE : undefined,
          }}
        >
          <div style={{ ...HEADING, paddingBottom: "2pt" }}>
            {p.title}
          </div>
          <FieldGrid rows={p.rows} labelMin={100} pitchScale={1.1} />
        </div>
      ))}
    </section>
  )
}

function Signature() {
  return (
    <div style={{ padding: "26pt 0 0", textAlign: "center" }}>
      <div style={{ width: "240pt", margin: "0 auto", borderTop: STROKE }} />
      <div
        style={{
          fontWeight: 700,
          fontSize: "9pt",
          letterSpacing: "0.2pt",
          paddingTop: "3pt",
        }}
      >
        APPLICANT&rsquo;S SIGNATURE OVER PRINTED NAME
      </div>
    </div>
  )
}

/** The declaration beneath the signature: small, but set to be read. */
function Statements() {
  return (
    <div style={{ fontSize: `${FONT.statement}pt`, lineHeight: 1.45, textAlign: "left" }}>
      {STATEMENTS.map((s) => (
        <p key={s} style={{ margin: "0 0 3pt" }}>
          {s}
        </p>
      ))}
    </div>
  )
}

function RenderBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "fields":
      return <FieldGrid rows={block.rows} labelMin={block.labelMin} />
    case "box":
      return (
        <div style={{ marginTop: block.spaceBefore ? `${block.spaceBefore}pt` : undefined }}>
          <Box title={block.title} rows={block.rows} labelMin={block.labelMin} />
        </div>
      )
    case "compare":
      return <Compare left={block.left} right={block.right} />
    case "reason":
      return <Reason options={block.options} />
    case "signature":
      return <Signature />
    case "statements":
      return <Statements />
  }
}

/** Logos keep their own aspect ratios; only the height is set. */
function Logo({ src, height }: { src: string; height: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ display: "block", height: `${height}pt`, width: "auto" }} />
}

/**
 * The same head on every form: logos either side of the city's name, a rule,
 * the form's title between two rules, and the control number the office fills
 * in on receipt. The side groups share the width equally, so the name stays on
 * the page's centre line however wide the logos on either side are.
 */
function FormHeader({ title }: { title: string }) {
  return (
    <header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          columnGap: "8pt",
          paddingBottom: "6pt",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5pt" }}>
          <Logo src="/logo1.png" height={44} />
          <Logo src="/logo2.png" height={44} />
        </div>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", lineHeight: 1.25 }}>
          <div style={{ fontSize: "12pt" }}>Republic of the Philippines</div>
          <div style={{ fontSize: "15.5pt", fontWeight: 700 }}>CITY GOVERNMENT OF OZAMIZ</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5pt" }}>
          <Logo src="/logo3.png" height={44} />
          <Logo src="/logo4.png" height={28} />
        </div>
      </div>
      <div style={{ borderTop: STROKE }} />
      <div
        style={{
          padding: "7pt 0 0",
          textAlign: "center",
          fontWeight: 700,
          fontSize: `${FONT.title}pt`,
          whiteSpace: "nowrap",
        }}
      >
        APPLICATION FORM : {title}
      </div>
      {/* Filled in by the office on receipt. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          paddingTop: "5pt",
          fontSize: `${FONT.body}pt`,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        <span style={{ whiteSpace: "nowrap", paddingRight: `${LABEL_GAP}pt` }}>Control No.:</span>
        <span style={{ width: "130pt", height: `${PITCH - 4}pt`, boxSizing: "border-box", borderBottom: STROKE }} />
      </div>
    </header>
  )
}

/** The city seal behind the form: there for the paper's sake, not the reader's. */
function Watermark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/city-seal.jpg"
      alt=""
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "148mm",
        height: "148mm",
        transform: "translate(-50%, -50%)",
        // Multiply drops the JPEG's white square into the paper, leaving only
        // the seal, tinted back by the opacity so handwriting and photocopies
        // stay legible over it.
        opacity: 0.05,
        mixBlendMode: "multiply",
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  )
}

/** The sheet: the chosen form, one to an A4 page. */
export function ApplicationFormSheet({ type }: { type: ApplicationFormType }) {
  const def = FORMS[type]

  return (
    <div
      className="mtop-form-sheet"
      style={{
        width: SHEET_W,
        height: SHEET_H,
        background: "#fff",
        color: "#000",
        fontFamily: SANS,
        fontSize: `${FONT.body}pt`,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: `${BLOCK_GAP}pt`,
          boxSizing: "border-box",
          height: "100%",
          padding: `${MARGIN_TOP} ${MARGIN_X} ${MARGIN_BOTTOM}`,
          // Its own stacking context, so the seal can sit behind the form's
          // writing without ever dropping behind the sheet's white.
          position: "relative",
          zIndex: 0,
          isolation: "isolate",
        }}
      >
        <Watermark />
        <FormHeader title={def.title} />
        {def.blocks.map((b, i) => (
          <RenderBlock key={i} block={b} />
        ))}
      </div>
    </div>
  )
}
