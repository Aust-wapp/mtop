import type { ConfirmationSlipData } from "@/lib/actions/confirmation-slip"

/**
 * The LTO Confirmation Slip, as the Office of the City Mayor issues it.
 *
 * Unlike the franchise card next door, this one has no source PDF to take
 * coordinates from — the original is an office form, so it is rebuilt as a
 * form: preprinted wording in Arial, values typed on ruled blanks in Courier,
 * the way the typed originals read. Every blank is a flex child, so a long
 * route or operator name stretches its rule instead of pushing the line apart,
 * and clips at the rule's end rather than running off the paper.
 *
 * Set in system fonts on purpose. The original was typed on whatever the
 * office had, and Arial/Courier/Times are on every machine that will ever
 * print this, so there is no webfont to fail mid-print.
 */

/** 8.5 x 13in long bond, the stock the office already prints the card on. */
const PAGE_W = 612
const PAGE_H = 936
const MARGIN = 54

const SERIF = '"Times New Roman", Times, serif'
const SANS = 'Arial, Helvetica, sans-serif'
/** The typed values. The originals came off a typewriter; this is its echo. */
const TYPED = '"Courier New", Courier, monospace'

/**
 * The slip is issued in a set of two: the LTO's copy carries the red marking,
 * the office's own copy is the same sheet without it. Printing both together
 * is what the counter actually needs — one press, two sheets — so the page
 * renders the set rather than a single slip.
 */
const COPY_LABEL = "LTO COPY"

/** Typed values sit at this size unless the value is too long for its rule. */
const TYPED_SIZE = 11
/** Below this the typing stops being readable in print; clip instead. */
const TYPED_MIN = 7
/** Extra space between typed glyphs, counted into the fit above. */
const TYPED_TRACKING = 0.5

/**
 * A value typed on a ruled blank. Grows with the line unless given a width.
 *
 * A long route or a double-barrelled name has to fit the rule it is typed on —
 * an official slip that drops half an address is worse than one set a point
 * smaller. Courier is monospaced at exactly 0.6em per glyph, so N characters
 * occupy N × (0.6 × size + the letter-spacing), and the size that fits them on
 * a rule of width W is (W − 0.5N) / 0.6N. Written against `cqw` (1% of the
 * rule's own width) the browser resolves W itself, so there is no measuring
 * pass and nothing to re-tune when the wording around the blank changes.
 */
function Blank({
  value,
  width,
  grow,
  align = "center",
}: {
  value: string
  width?: number
  grow?: number
  align?: "center" | "left"
}) {
  const fitted =
    value.length > 0
      ? `clamp(${TYPED_MIN}pt, calc((100cqw - ${(
          TYPED_TRACKING * value.length
        ).toFixed(2)}pt) / ${(0.6 * value.length).toFixed(2)}), ${TYPED_SIZE}pt)`
      : `${TYPED_SIZE}pt`

  return (
    <span
      style={{
        flex: grow ? `${grow} 1 0` : undefined,
        width: width ? `${width}pt` : undefined,
        minWidth: 0,
        borderBottom: "0.75pt solid #000",
        textAlign: align,
        whiteSpace: "nowrap",
        // The rule is what the value is measured against, and the clip of last
        // resort for a value even TYPED_MIN cannot fit.
        containerType: "inline-size",
        overflow: "hidden",
        // Lift the text off its rule the way a typewriter's baseline sits.
        paddingBottom: "1pt",
      }}
    >
      <span
        style={{
          fontFamily: TYPED,
          fontSize: fitted,
          letterSpacing: `${TYPED_TRACKING}pt`,
        }}
      >
        {value || " "}
      </span>
    </span>
  )
}

/** One line of the form: preprinted words and blanks sitting on one baseline. */
function Line({
  children,
  gap = 6,
  indent = 0,
  top = 0,
}: {
  children: React.ReactNode
  gap?: number
  indent?: number
  top?: number
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: `${gap}pt`,
        marginLeft: `${indent}pt`,
        marginTop: `${top}pt`,
      }}
    >
      {children}
    </div>
  )
}

/** MAKE / MOTOR NO. / CHASIS NO. / PLATE NO. — label, colon, value. */
function UnitRow({ label, value }: { label: string; value: string }) {
  return (
    <Line indent={36} top={4} gap={0}>
      <span style={{ width: "96pt" }}>{label}</span>
      <span style={{ width: "18pt" }}>:</span>
      <Blank value={value} width={240} align="left" />
    </Line>
  )
}

/** Paid under O.R. No. / Amount of / Date Issued / Issued at. */
function PaymentRow({ label, value }: { label: string; value: string }) {
  return (
    <Line top={3} gap={0}>
      <span style={{ width: "124pt", fontSize: "10.5pt" }}>{label}</span>
      <span style={{ width: "14pt" }}>:</span>
      <Blank value={value} width={160} align="left" />
    </Line>
  )
}

/**
 * One sheet. `copyLabel` is the red marking in the top right — the LTO's copy
 * carries it, the office's copy is the same sheet without one.
 */
function Sheet({
  data,
  copyLabel,
}: {
  data: ConfirmationSlipData
  copyLabel?: string
}) {
  return (
    <div
      className="mtop-slip"
      style={{
        position: "relative",
        width: `${PAGE_W}pt`,
        height: `${PAGE_H}pt`,
        padding: `${MARGIN}pt`,
        background: "#fff",
        color: "#000",
        fontFamily: SANS,
        fontSize: "11pt",
        lineHeight: 1.45,
        boxSizing: "border-box",
      }}
    >
      {/* Letterhead */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12pt",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6pt" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo1.png" alt="" style={{ height: "52pt" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo2.png" alt="" style={{ height: "52pt" }} />
        </div>

        <div style={{ textAlign: "center", fontFamily: SERIF }}>
          <div style={{ fontSize: "13.5pt", fontWeight: 700 }}>
            REPUBLIC OF THE PHILIPPINES
          </div>
          <div style={{ fontSize: "13.5pt", fontWeight: 700 }}>
            OFFICE OF THE CITY MAYOR
          </div>
          <div style={{ fontSize: "12pt", fontWeight: 700 }}>Ozamiz City</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6pt" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo3.png" alt="" style={{ height: "46pt" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo4.png" alt="" style={{ height: "30pt" }} />
        </div>
      </div>

      {/* Copy marking. The unmarked copy still reserves the line, so both
          sheets of the set line up page for page. */}
      <div
        style={{
          marginTop: "42pt",
          textAlign: "right",
          paddingRight: "36pt",
          color: "#CE1126",
          fontWeight: 700,
          fontSize: "16pt",
          letterSpacing: "0.5pt",
        }}
      >
        {copyLabel ?? "\u00A0"}
      </div>

      <div
        style={{
          marginTop: "36pt",
          textAlign: "center",
          fontWeight: 700,
          fontSize: "15pt",
          textDecoration: "underline",
          textUnderlineOffset: "3pt",
          letterSpacing: "0.5pt",
        }}
      >
        CONFIRMATION SLIP
      </div>

      {/* Addressee */}
      <div style={{ marginTop: "30pt", fontWeight: 700, lineHeight: 1.5 }}>
        <div>TRANSPORTATION DISTRICT OFFICE</div>
        <div>LAND TRANSPORTATION OFFICE</div>
        <div>OZAMIZ CITY</div>
      </div>

      {/* The confirmation proper */}
      <div style={{ marginTop: "26pt" }}>
        <Line indent={54}>
          <span style={{ whiteSpace: "nowrap" }}>
            This is to CONFIRM the Motorized Tricycle Operator&rsquo;s Permit
            No:
          </span>
          <Blank value={data.mtopNumber} grow={1} />
        </Line>

        <Line top={8}>
          <span style={{ whiteSpace: "nowrap" }}>granted to</span>
          <Blank value={data.ownerName} grow={1} />
          <span style={{ whiteSpace: "nowrap" }}>with</span>
        </Line>

        <Line top={8}>
          <span style={{ whiteSpace: "nowrap" }}>address at</span>
          <Blank value={data.ownerAddress} grow={1} />
          <span style={{ whiteSpace: "nowrap" }}>, OZAMIZ CITY.</span>
        </Line>

        <Line top={20}>
          <span style={{ whiteSpace: "nowrap" }}>Cab No.</span>
          <Blank value={data.cabNumber} width={72} />
          <span style={{ whiteSpace: "nowrap" }}>
            shall operate in ROUTE from
          </span>
          <Blank value={data.route} grow={1} />
        </Line>

        <div style={{ marginTop: "8pt" }}>
          to CITY PROPER AND VICE VERSA of One ( 1 ) unit MCH described below:
        </div>

        <div style={{ marginTop: "6pt" }}>
          <UnitRow label="MAKE" value={data.make} />
          <UnitRow label="MOTOR NO." value={data.motorNumber} />
          <UnitRow label="CHASIS NO." value={data.chassisNumber} />
          <UnitRow label="PLATE NO." value={data.plateNumber} />
        </div>

        <Line top={22}>
          <span style={{ whiteSpace: "nowrap" }}>Given this</span>
          <span
            style={{
              fontFamily: TYPED,
              fontSize: "11pt",
              borderBottom: "0.75pt solid #000",
              paddingBottom: "1pt",
              whiteSpace: "nowrap",
            }}
          >
            {data.grantedDay || "  "}
            <sup style={{ fontSize: "7pt" }}>{data.grantedOrdinal}</sup>
          </span>
          <span style={{ whiteSpace: "nowrap" }}>day of</span>
          <Blank value={data.grantedMonth} grow={1} />
          <span style={{ whiteSpace: "nowrap", fontFamily: TYPED }}>
            ,&nbsp;{data.grantedYear}
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            at the City of Ozamiz, Philippines.
          </span>
        </Line>
      </div>

      {/* What was paid for it */}
      <div style={{ marginTop: "26pt" }}>
        <PaymentRow label="Paid under O.R. No." value={data.orNumber} />
        <PaymentRow label="Amount of" value={data.amountPaid} />
        <PaymentRow label="Date Issued" value={data.datePaid} />
        <PaymentRow label="Issued at" value={data.issuedAt} />
      </div>

      {/* Approval uses the current saved Mayor settings. The signature sits
          across the printed name, not the designation. The fixed-size slot
          preserves the original two-page long-bond layout on screen and in print. */}
      <div style={{ marginTop: "40pt", textAlign: "center" }}>
        <div style={{ fontSize: "12pt" }}>APPROVED:</div>
        <div style={{ height: "54pt", position: "relative" }}>
          {data.mayorSignatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.mayorSignatureUrl}
              alt="City Mayor signature"
              style={{
                position: "absolute",
                left: "50%",
                top: "20pt",
                transform: "translateX(-50%)",
                width: "170pt",
                height: "48pt",
                maxWidth: "100%",
                objectFit: "contain",
                mixBlendMode: "multiply",
                opacity: 0.92,
                zIndex: 2,
                pointerEvents: "none",
              }}
            />
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: "12pt" }}>
          {data.mayorName || "\u00A0"}
        </div>
        <div style={{ fontSize: "11pt" }}>{data.mayorDesignation || "City Mayor"}</div>
      </div>
    </div>
  )
}

/**
 * The pair the office issues together: the LTO's marked copy, then its own
 * unmarked one. Each sheet is its own page — `.mtop-slip` breaks after itself
 * in print.css — so one press of Print produces the whole set.
 */
export function ConfirmationSlip({ data }: { data: ConfirmationSlipData }) {
  return (
    <>
      <Sheet data={data} copyLabel={COPY_LABEL} />
      <Sheet data={data} />
    </>
  )
}
