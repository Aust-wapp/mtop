import type { CSSProperties, ReactNode } from "react"

/** Seven A4 application forms with shared paper-form typography and section frames. */

/** A4, portrait. A hair under 297mm so rounding never spills a blank page. */
const SHEET_W = "210mm"
const SHEET_H = "296.5mm"
/** 0.3cm on every side: the content runs close to the paper edge, like the office's originals. Header and divider rules span the content width, so they follow. */
const MARGIN_X = "3mm"
const MARGIN_TOP = "3mm"
const MARGIN_BOTTOM = "3mm"

const SANS = "Arial, Helvetica, sans-serif"

/** Rules and box strokes: one weight, thin enough to write across, dark enough to photocopy. */
const STROKE = "1pt solid #000"
/** Fill-in lines: field rules, signature, reason lines. A step lighter than STROKE so the frame outranks what is written on it. */
const WRITE = "0.75pt solid #000"

/** Type sizes, in pt. */
const FONT = {
  body: 10.5,
  small: 8.5,
  undertaking: 9,
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
/** Inset only the title and form body; the official header keeps the approved page margins. */
const BODY_INSET = "3mm"
const SECTION_PADDING = "6pt 10pt 9pt"
const SECTION_FRAME = { border: STROKE, breakInside: "avoid" } as const

/** Rebalance only the four longer forms, from the title down; keep the header and signing space intact. */
const UNDERTAKING_BODY_SPACING = {
  "--mtop-row-pitch": "21pt",
  "--mtop-block-gap": "7pt",
  "--mtop-group-gap": "7pt",
  "--mtop-section-padding": "4pt 10pt 6pt",
  "--mtop-heading-padding": "3pt 10pt",
  "--mtop-title-padding": "5pt 0 0",
  "--mtop-control-padding": "3pt",
  "--mtop-control-height": "18pt",
} as CSSProperties

const ROW_PITCH = `var(--mtop-row-pitch, ${PITCH}pt)`
const ROW_GROUP_GAP = `var(--mtop-group-gap, ${GROUP_GAP}pt)`
const BOX_PADDING = `var(--mtop-section-padding, ${SECTION_PADDING})`

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
 * column.
 */
type Row =
  | { labels: string[]; short?: boolean }
  | "gap"

/**
 * One field to a line, with a common endpoint regardless of label length.
 */
interface Line {
  label: string
}

type LineItem = Line | "gap"

interface Panel {
  title: string
  rows: Row[]
}

type Block =
  | { kind: "fields"; rows: Row[]; labelMin?: number }
  | { kind: "lines"; lines: LineItem[]; labelMin?: number }
  | { kind: "box"; title: string; rows: Row[]; labelMin?: number; spaceBefore?: number }
  | { kind: "compare"; left: Panel; right: Panel }
  | { kind: "reason"; options: string[] }
  | { kind: "signature" }
  | { kind: "undertaking" }

interface FormDefinition {
  title: string
  blocks: Block[]
}

const row = (...labels: string[]): Row => ({ labels })
const line = (label: string): Line => ({ label })

/** The applicant's own details, one to a line. Every application form carries Address and Contact No. */
const applicantLines: LineItem[] = [
  line("Application Date:"),
  line("Applicant’s Name:"),
  line("Address:"),
  line("Contact No.:"),
]

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
const driverLines: LineItem[] = [
  "gap",
  line("Driver’s Name:"),
  line("Driver’s Address:"),
  line("Driver’s License No.:"),
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
    row("Plate No.:"),
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
        kind: "lines",
        lines: [...applicantLines, ...driverLines],
      },
      newUnitBox,
      { kind: "undertaking" },
      { kind: "signature" },
    ],
  },
  renewal: {
    title: "RENEWAL OF FRANCHISE",
    blocks: [
      {
        kind: "lines",
        lines: [...applicantLines, ...driverLines],
      },
      unitBox,
      { kind: "undertaking" },
      { kind: "signature" },
    ],
  },
  // The system records the successor's name, address and contact number
  // (new_* on the application) and keeps the current owner on the franchise
  // until grant. It records no date of death and no relationship, so the form
  // asks for neither. There is no unit box — the unit does not change.
  "change-of-ownership": {
    title: "CHANGE OF OWNERSHIP",
    blocks: [
      {
        kind: "lines",
        labelMin: 118,
        lines: [...applicantLines, line("MTOP No.:")],
      },
      {
        kind: "box",
        title: "CURRENT OWNER (DECEASED):",
        labelMin: 118,
        rows: [row("Full Name:"), row("Body/Cab No.:"), row("Plate No.:")],
      },
      {
        kind: "box",
        title: "NEW OWNER (SUCCESSOR):",
        labelMin: 118,
        rows: [
          row("Full Name:"),
          row("Contact No.:"),
          row("Address:"),
          row("Driver’s License No.:"),
        ],
      },
      { kind: "undertaking" },
      { kind: "signature" },
    ],
  },
  "change-unit": {
    title: "MOTOR VEHICLE CHANGE UNIT",
    blocks: [
      {
        kind: "lines",
        lines: [...applicantLines, line("MTOP No.:")],
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
      { kind: "undertaking" },
      { kind: "signature" },
    ],
  },
  closure: {
    title: "CLOSURE OF FRANCHISE",
    blocks: [
      {
        kind: "lines",
        lines: [...applicantLines, line("MTOP No.:"), line("Body/Cab No.:"), line("Plate No.:")],
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
        kind: "lines",
        lines: [...applicantLines, line("MTOP No.:"), line("Body/Cab No.:")],
      },
      { kind: "reason", options: ["Closure", "LTO Clearance", "BIR Clearance", "Others"] },
      { kind: "signature" },
    ],
  },
  "confirmation-slip": {
    title: "CONFIRMATION SLIP",
    blocks: [
      {
        kind: "lines",
        lines: [...applicantLines, line("MTOP No.:")],
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

const UNDERTAKING = {
  introduction: "Isip aplikante sa Motorized Tricycle Operator's Permit (MTOP) sa City Government of Ozamiz, boluntaryo kong miuyon ug misaad nga akong tumanon ang mosunod:",
  provisions: [
    "Ako mosaad nga motuman sa tanang balaod, ordinansa, ug lagda sa City Government of Ozamiz, LTO, ug ubang ahensya. Padaganon nako ang akong motorcab sa luwas ug hapsay nga paagi nga dili makapahamak sa publiko.",
    "Ako motugot nga inspeksyonon sa mga awtorisadong opisyal sa City Government, IBPLS, MTOP Focal Person, o uban pang gitugotan ang akong motorcab, dokumento, ug rekord bisan kanus-a. Dili ko mobalibad kung husto nga gipangayo ang inspeksyon.",
    "Ako nagpamatuod nga tinuod, sakto, ug kompleto ang tanang impormasyon ug dokumento nga akong gisumite. Nasabtan nako nga ang paghatag og bakak nga impormasyon mahimong hinungdan sa dili pag-aprobar, pagsuspenso, o pagkansela sa akong permit/prangkisa, ug mahimo usab kong kasuhan sumala sa balaod (perjury).",
    "Ako motugot nga kolektahon, gamiton, iproseso, ug tipigan sa City Government of Ozamiz ang akong personal nga impormasyon alang lamang sa opisyal nga proseso sa gobyerno. Kini protektahan sumala sa Data Privacy Act ug dili ihatag sa uban nga walay hustong awtoridad.",
    "Ako mosaad nga kanunay updated ug valid ang akong mga dokumento ug rehistro, ug ang akong motorcab luwas, maayo ang kondisyon, adunay saktong insurance, ug nagsunod sa safety standards. Magpa-renew ko sa dili pa ma-expire ang akong permit/prangkisa ug mobayad sa tanang bayranan sa hustong oras.",
    "Ako nakasabot ug miuyon nga ang dili pagtuman sa bisan unsang kondisyon mahimong hinungdan sa awtomatikong pagkansela sa akong permit/prangkisa, bisan walay dugang pahibalo.",
  ],
}
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
  height: ROW_PITCH,
  whiteSpace: "nowrap",
  fontWeight: 700,
  lineHeight: 1.1,
} as const

/** A writing line the width of its cell. */
function Rule({ column, pitch = ROW_PITCH }: { column: string; pitch?: string }) {
  return (
    <div
      style={{
        gridColumn: column,
        boxSizing: "border-box",
        height: pitch,
        borderBottom: WRITE,
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
  const across = Math.max(1, ...rows.map((r) => (r === "gap" ? 1 : r.labels.length)))
  const columns = Array.from({ length: across }, (_, i) => {
    const min = i === 0 ? labelMin : across === 2 ? LABEL_MIN_RIGHT : 0
    return `minmax(${min}pt, max-content) minmax(0, 1fr)`
  }).join(" ")
  const pitch = `calc(${ROW_PITCH} * ${pitchScale})`

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: rows.map((r) => (r === "gap" ? ROW_GROUP_GAP : pitch)).join(" "),
        fontSize: `${FONT.body}pt`,
      }}
    >
      {rows.map((r, y) => {
        if (r === "gap") {
          return <div key={y} style={{ gridColumn: "1 / -1", height: ROW_GROUP_GAP, alignSelf: "start" }} />
        }
        return r.labels.map((label, x) => {
          const last = x === r.labels.length - 1
          const ruleEnd = last && !r.short ? "-1" : String(x * 2 + 3)
          return [
            <div
              key={`${y}-${x}-l`}
              style={{
                ...labelStyle,
                height: pitch,
                gridColumn: String(x * 2 + 1),
                paddingLeft: x > 0 ? `${CELL_GAP}pt` : 0,
                paddingRight: `${LABEL_GAP}pt`,
              }}
            >
              <span>
                <Label text={label} />
              </span>
            </div>,
            <Rule key={`${y}-${x}-r`} column={`${x * 2 + 2} / ${ruleEnd}`} pitch={pitch} />,
          ]
        })
      })}
    </div>
  )
}

/**
 * Fields one to a line. The label column is as wide as on the grid, so the
 * rules start where they do on the other forms, and every row is the same
 * width, so they end together too.
 */
function Lines({ lines, labelMin = LABEL_MIN }: { lines: LineItem[]; labelMin?: number }) {
  return (
    <div style={{ fontSize: `${FONT.body}pt` }}>
      {lines.map((l, i) =>
        l === "gap" ? (
          <div key={i} style={{ height: ROW_GROUP_GAP }} />
        ) : (
          <div
            key={l.label}
            style={{ display: "flex", width: "100%", height: ROW_PITCH }}
          >
            <div
              style={{
                ...labelStyle,
                height: ROW_PITCH,
                flex: "none",
                minWidth: `${labelMin}pt`,
                paddingRight: `${LABEL_GAP}pt`,
              }}
            >
              <span>
                <Label text={l.label} />
              </span>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: "border-box",
                height: ROW_PITCH,
                borderBottom: WRITE,
              }}
            />
          </div>
        )
      )}
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
    <Section title="REASON:">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "7pt",
          padding: "6pt 0 7pt",
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
      {/* Preserve the original three reason-writing lines. */}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} style={{ height: `${PITCH}pt`, borderBottom: WRITE }} />
      ))}
    </Section>
  )
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ ...HEADING, background: "#ededed", borderBottom: STROKE, padding: "var(--mtop-heading-padding, 5pt 10pt)" }}>
      {title}
    </div>
  )
}

/** One complete rectangular frame and heading treatment for all information groups. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={SECTION_FRAME}>
      <SectionHeading title={title} />
      <div style={{ padding: BOX_PADDING }}>{children}</div>
    </section>
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
    <Section title={title}>
      <FieldGrid rows={rows} labelMin={labelMin} />
    </Section>
  )
}

/** Old and new side by side in one frame, split down the middle. */
function Compare({ left, right }: { left: Panel; right: Panel }) {
  return (
    <section style={{ ...SECTION_FRAME, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      {[left, right].map((p, i) => (
        <div
          key={p.title}
          style={{
            minWidth: 0,
            borderLeft: i === 1 ? STROKE : undefined,
          }}
        >
          <SectionHeading title={p.title} />
          <div style={{ padding: BOX_PADDING }}>
            <FieldGrid rows={p.rows} labelMin={100} pitchScale={1.1} />
          </div>
        </div>
      ))}
    </section>
  )
}

function Signature() {
  return (
    <div style={{ padding: "34pt 0 0", textAlign: "center", breakInside: "avoid" }}>
      <div style={{ width: "240pt", margin: "0 auto", borderTop: WRITE }} />
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

/** Shared Cebuano introduction and six provisions, before signing. */
function Undertaking() {
  return (
    <Section title="UNDERTAKING">
      <div style={{ fontSize: `${FONT.undertaking}pt`, fontWeight: 400, lineHeight: 1.4, textAlign: "left", overflowWrap: "break-word" }}>
        <p style={{ margin: 0 }}>{UNDERTAKING.introduction}</p>
        <ol style={{ listStyleType: "decimal", listStylePosition: "outside", paddingLeft: "14pt", margin: "4pt 0 0" }}>
          {UNDERTAKING.provisions.map((text, i) => (
            <li key={text} style={{ paddingLeft: "2pt", marginTop: i === 0 ? 0 : "4pt", breakInside: "avoid" }}>
              {text}
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}

function RenderBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "fields":
      return <Box title="APPLICANT INFORMATION" rows={block.rows} labelMin={block.labelMin} />
    case "lines":
      return (
        <Section title="APPLICANT INFORMATION">
          <Lines lines={block.lines} labelMin={block.labelMin} />
        </Section>
      )
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
    case "undertaking":
      return <Undertaking />
  }
}

/** Logos keep their own aspect ratios; only the height is set. */
function Logo({ src, height }: { src: string; height: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ display: "block", height: `${height}pt`, width: "auto" }} />
}

/**
 * The approved official header and full-width divider, outside the body inset.
 */
function FormHeader() {
  return (
    <header>
      {/* One centred group: logos hug the name rather than sitting at the page corners. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          columnGap: "12pt",
          paddingBottom: "6pt",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5pt" }}>
          <Logo src="/logo1.png" height={44} />
          <Logo src="/logo2.png" height={44} />
        </div>
        <div style={{ textAlign: "center", whiteSpace: "nowrap", lineHeight: 1.25, fontSize: "14pt", fontWeight: 700 }}>
          <div>Republic of the Philippines</div>
          <div>CITY GOVERNMENT OF OZAMIZ</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5pt" }}>
          <Logo src="/logo3.png" height={44} />
          <Logo src="/logo4.png" height={28} />
        </div>
      </div>
      {/* Spans the full content width, between the page margins; the group above stays compact. */}
      <div style={{ borderTop: STROKE }} />
    </header>
  )
}

/** The title and office control number belong to the inset body area. */
function FormTitle({ title }: { title: string }) {
  return (
    <div>
      <div
        style={{
          padding: "var(--mtop-title-padding, 7pt 0 0)",
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
          paddingTop: "var(--mtop-control-padding, 5pt)",
          fontSize: `${FONT.body}pt`,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        <span style={{ whiteSpace: "nowrap", paddingRight: `${LABEL_GAP}pt` }}>Control No.:</span>
        <span style={{ width: "130pt", height: `var(--mtop-control-height, ${PITCH - 4}pt)`, boxSizing: "border-box", borderBottom: WRITE }} />
      </div>
    </div>
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
  const hasUndertaking = def.blocks.some((block) => block.kind === "undertaking")

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
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
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
        <FormHeader />
        <div style={{
          ...(hasUndertaking ? UNDERTAKING_BODY_SPACING : {}),
          display: "flex",
          flexDirection: "column",
          gap: `var(--mtop-block-gap, ${BLOCK_GAP}pt)`,
          margin: `0 ${BODY_INSET}`,
        }}>
          <FormTitle title={def.title} />
          {def.blocks.map((block, i) => (
            <RenderBlock key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  )
}
