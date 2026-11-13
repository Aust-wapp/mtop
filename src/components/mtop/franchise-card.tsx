import type { FranchiseCardData } from "@/lib/actions/card"

/**
 * Pixel-faithful rebuild of the issued MTOP permit.
 *
 * Geometry comes straight from the source Canva PDF: the page is 612 x 936pt
 * (8.5 x 13in folio) and every string is placed at the coordinates pdftotext
 * reported for the corresponding line in the original. The artwork —
 * letterhead logos, gradient bands, tricycle, ornamental footer,
 * bullet marks and photo placeholders — is `/mtop-card-art.svg`, which is the
 * original PDF converted to SVG with text glyphs and sample signatures removed. Nothing is
 * redrawn by hand, so the design stays exact; only the data is ours.
 */

const PAGE_W = 612
const PAGE_H = 936

/**
 * Each font's content-area ratio (fontBoundingBoxAscent + Descent), as Chrome
 * reports it. Using these as `line-height` zeroes the half-leading, so a span's
 * box top coincides with the top of the font's bounding box — which is exactly
 * what pdftotext reports as a line's yMin. That lets every `y` below be the
 * raw coordinate from the source PDF with no correction term.
 */
const LINE_HEIGHT = {
  oswald: 1.48,
  poppins: 1.4,
  playfair: 1.33,
} as const

/** The page colour, lifted out of the artwork SVG so the watermark can sit on it. */
const CREAM = "#FFF5E5"

const INDIGO = "#2D338B"
const RED = "#CE1126"
const WATERMARK = "#FFE1C7"
const BADGE_NEW = "#E5E5C5"
const BADGE_RENEWAL = "#EDE5D8"
const MUTED = "#8C867D"

/** Left-aligned run, positioned by the original line box's top-left corner. */
function T({
  x,
  y,
  size,
  children,
  font = "poppins",
  weight = 400,
  italic,
  color = "#000",
  tracking,
}: {
  x: number
  y: number
  size: number
  children: React.ReactNode
  font?: "poppins" | "oswald" | "playfair"
  weight?: number
  italic?: boolean
  color?: string
  tracking?: number
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: `${x}pt`,
        top: `${y}pt`,
        fontFamily: `var(--card-${font})`,
        fontSize: `${size}pt`,
        fontWeight: weight,
        fontStyle: italic ? "italic" : "normal",
        color,
        letterSpacing: tracking ? `${tracking}pt` : undefined,
        lineHeight: LINE_HEIGHT[font],
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

/** Centred run — stays centred on `cx` however long the real value is. */
function C({
  cx,
  y,
  size,
  children,
  font = "poppins",
  weight = 400,
  italic,
  color = "#000",
  tracking,
}: {
  cx: number
  y: number
  size: number
  children: React.ReactNode
  font?: "poppins" | "oswald" | "playfair"
  weight?: number
  italic?: boolean
  color?: string
  tracking?: number
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: `${cx}pt`,
        top: `${y}pt`,
        transform: "translateX(-50%)",
        fontFamily: `var(--card-${font})`,
        fontSize: `${size}pt`,
        fontWeight: weight,
        fontStyle: italic ? "italic" : "normal",
        color,
        letterSpacing: tracking ? `${tracking}pt` : undefined,
        lineHeight: LINE_HEIGHT[font],
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

/**
 * The right-hand edge of the printable area, taken from the terms block, which
 * runs from x=27.4 for 577.9pt. Nothing may cross it.
 */
const CONTENT_RIGHT = 600

/**
 * Approximate advance width of a string, in points.
 *
 * The card is rendered on the server and printed straight away, so there is no
 * layout pass to measure against — a value's width has to be estimated before
 * it is drawn. These are Poppins' proportions bucketed by character class, and
 * they lean generous: over-estimating shrinks a line slightly more than it
 * needed, while under-estimating pushes it off the paper, which is the bug
 * this exists to prevent.
 */
function estimateWidth(text: string, size: number, weight: number): number {
  let ems = 0
  for (const char of text) {
    if (char === " ") ems += 0.26
    else if ("mwMW".includes(char)) ems += 0.92
    else if ("iltfjIJ.,'`-:;()".includes(char)) ems += 0.32
    else if (char >= "A" && char <= "Z") ems += 0.68
    else if (char >= "0" && char <= "9") ems += 0.62
    else ems += 0.58
  }
  // Bold is a touch wider than regular at the same size.
  return ems * size * (weight >= 700 ? 1.04 : 1)
}

/**
 * A data value that must not run past the edge of the paper.
 *
 * Long values — a purok spelled out in full, a double-barrelled operator name —
 * used to keep going at full size, over the border and off the page, because
 * every run on this card is absolutely positioned and set to `nowrap`. This
 * shrinks the type until the string fits the space it has, down to `minSize`,
 * and clips at the boundary as a last resort so the overflow can never come
 * back. Values short enough to fit are untouched, so the card is unchanged for
 * almost every permit.
 */
function Fit({
  x,
  y,
  size,
  minSize = 9,
  right = CONTENT_RIGHT,
  children,
  font = "poppins",
  weight = 400,
  color = "#000",
}: {
  x: number
  y: number
  size: number
  minSize?: number
  right?: number
  children: string
  font?: "poppins" | "oswald" | "playfair"
  weight?: number
  color?: string
}) {
  const available = right - x
  const estimated = estimateWidth(children, size, weight)
  const fitted =
    estimated > available
      ? Math.max(minSize, size * (available / estimated))
      : size

  return (
    <span
      style={{
        position: "absolute",
        left: `${x}pt`,
        top: `${y}pt`,
        maxWidth: `${available}pt`,
        overflow: "hidden",
        fontFamily: `var(--card-${font})`,
        fontSize: `${fitted}pt`,
        fontWeight: weight,
        color,
        lineHeight: LINE_HEIGHT[font],
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

function CenteredFit({
  cx,
  y,
  size,
  width,
  children,
}: {
  cx: number
  y: number
  size: number
  width: number
  children: string
}) {
  const estimated = estimateWidth(children, size, 700)
  const fitted = estimated > width ? Math.max(8, size * width / estimated) : size
  return (
    <span style={{
      position: "absolute",
      left: `${cx}pt`,
      top: `${y}pt`,
      transform: "translateX(-50%)",
      maxWidth: `${width}pt`,
      overflow: "hidden",
      whiteSpace: "nowrap",
      fontFamily: "var(--card-poppins)",
      fontSize: `${fitted}pt`,
      fontWeight: 700,
      lineHeight: LINE_HEIGHT.poppins,
    }}>{children}</span>
  )
}

function Photo({ url, y }: { url: string | null; y: number }) {
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{
        position: "absolute",
        left: "69.6pt",
        top: `${y}pt`,
        width: "141.1pt",
        height: "141.2pt",
        objectFit: "cover",
        borderRadius: "12pt",
      }}
    />
  )
}

const TERMS: string[][] = [
  [
    "The MTOP Holder/Franchise Operator shall operate only one (1) authorized motorized tricycle unit and comply with all",
    "applicable laws, ordinances, and regulations of the City Government of Ozamiz and relevant government agencies.",
  ],
  [
    "The motorized tricycle unit must be duly registered with the Land Transportation Office, maintained in roadworthy",
    "condition, and covered by valid insurance at all times.",
  ],
  [
    "Only the authorized driver with a valid professional driver’s license shall be allowed to operate an authorized unit, and all",
    "drivers must observe safe, lawful, and courteous conduct.",
  ],
  [
    "The MTOP Holder/Franchise Operator shall strictly observe approved routes, terminals, loading and unloading areas, and",
    "authorized fare rates prescribed by the City Government of Ozamiz or regulatory authorities.",
  ],
  [
    "Violation of franchise or permit conditions, traffic laws, or applicable ordinances may result in suspension, cancellation,",
    "revocation, or non-renewal of the franchise or permit.",
  ],
  ["All other terms and conditions are expressly stated at the back of this permit."],
]

/**
 * Flattened to one entry per printed line: the block runs at a constant 10.5pt
 * leading regardless of bullet boundaries, and every line but a bullet's last
 * is justified to the same measure as the original.
 */
const TERM_LINES = TERMS.flatMap((lines) =>
  lines.map((text, i) => ({ text, justify: i < lines.length - 1 }))
).map((line, i) => ({ ...line, y: 634.5 + i * 10.5 }))

export function FranchiseCard({ data }: { data: FranchiseCardData }) {
  // Operator block: labels at 224.2, values at 333.6, rows every 16.5pt.
  const operatorRows: [string, string][] = [
    ["Name:", data.ownerName],
    ["Address:", data.ownerAddress],
    ["Route:", data.route],
    ["Day Off:", data.dayOff],
  ]
  const vehicleRows: [string, string][] = [
    ["Make:", data.make],
    ["Motor No:", data.motorNumber],
    ["Chassis No:", data.chassisNumber],
    ["Plate No.", data.plateNumber],
  ]

  return (
    <div
      className="mtop-card"
      style={{
        position: "relative",
        width: `${PAGE_W}pt`,
        height: `${PAGE_H}pt`,
        overflow: "hidden",
        backgroundColor: CREAM,
      }}
    >
      {/* Layer 0 — the year watermark sits between the page colour and the
          artwork, so the divider rules cross it unbroken, as in the original.
          Painting it above the artwork would chop the lower rule into dashes. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <C
          cx={306}
          y={71.5}
          size={129}
          font="oswald"
          weight={700}
          color={WATERMARK}
        >
          {data.year}
        </C>
      </div>

      {/* Layer 1 — the original artwork, page background removed */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mtop-card-art.svg"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: `${PAGE_W}pt`,
          height: `${PAGE_H}pt`,
          zIndex: 1,
        }}
      />

      {/* Layer 2 — permit data */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
      {/* Photos sit above the artwork's placeholder illustrations */}
      <Photo url={data.ownerPhotoUrl} y={275.0} />
      <Photo url={data.driverPhotoUrl} y={436.3} />

      {/* Letterhead */}
      <C cx={302.2} y={12.1} size={11.3} font="playfair">
        REPUBLIC OF THE PHILIPPINES
      </C>
      <C cx={302.2} y={24.1} size={11.3} font="playfair">
        PROVINCE OF MISAMIS OCCIDENTAL
      </C>
      <C cx={302.2} y={35.4} size={13.3} font="playfair" weight={700}>
        LOCAL GOVERNMENT UNIT OF OZAMIZ CITY
      </C>
      <C cx={302.2} y={49.6} size={13.3} font="playfair" weight={700}>
        OFFICE OF THE CITY MAYOR
      </C>

      <C cx={309.8} y={93.8} size={28.1} font="oswald" weight={700} color={INDIGO}>
        MOTORIZED TRICYCLE OPERATOR&rsquo;S PERMIT (MTOP)
      </C>

      {/* NEW sits left, RENEWAL right — same size, as in the two source pages */}
      {data.variant === "NEW" ? (
        <T
          x={65.4}
          y={139.4}
          size={42.6}
          font="oswald"
          weight={700}
          color={BADGE_NEW}
        >
          NEW
        </T>
      ) : (
        <T
          x={440.3}
          y={138.6}
          size={42.6}
          font="oswald"
          weight={700}
          color={BADGE_RENEWAL}
        >
          RENEWAL
        </T>
      )}

      <C cx={306} y={145.6} size={27.3} font="oswald" weight={700} color={RED}>
        MTOP NO: {data.mtopNumber}
      </C>
      <C cx={306} y={176.4} size={27.3} font="oswald" weight={700} color={RED}>
        CAB NO: {data.cabNumber}
      </C>

      {/* Tracked out in the original; cx is nudged by half the tracking because
          the trailing letter-space is included in the element's width. */}
      <C
        cx={306.1}
        y={208.7}
        size={20.2}
        font="oswald"
        weight={700}
        tracking={1.17}
      >
        VALID ONLY FROM {data.validFrom} TO {data.validTo}
      </C>

      <C cx={309.8} y={240.7} size={14.6}>
        This MTOP is <strong style={{ fontWeight: 700 }}>GRANTED</strong> to the
        franchise operator below with the following details:
      </C>

      {/* Operator details */}
      {operatorRows.map(([label], i) => (
        <T key={label} x={224.2} y={268.2 + i * 16.5} size={15.1}>
          {label}
        </T>
      ))}
      {operatorRows.map(([label, value], i) => (
        <Fit key={`v-${label}`} x={333.6} y={268.2 + i * 16.5} size={15.1} weight={700}>
          {value}
        </Fit>
      ))}

      {/* Vehicle details */}
      {vehicleRows.map(([label], i) => (
        <T key={label} x={224.2} y={350.7 + i * 16.5} size={15.1}>
          {label}
        </T>
      ))}
      {vehicleRows.map(([label, value], i) => (
        <Fit key={`v-${label}`} x={333.6} y={350.7 + i * 16.5} size={15.1} weight={700}>
          {value}
        </Fit>
      ))}

      {/* Authorized driver */}
      <C cx={400.6} y={432.1} size={19.3} weight={700}>
        AUTHORIZED DRIVER
      </C>
      <C cx={400.6} y={453.6} size={15.3} italic>
        (With Valid LTO Driver&rsquo;s License)
      </C>

      <T x={224.2} y={488.3} size={15.1}>
        Name:
      </T>
      <Fit x={335.6} y={488.3} size={15.1} weight={700}>
        {data.driverName}
      </Fit>
      <T x={224.2} y={504.8} size={15.1}>
        Address:
      </T>
      <Fit x={335.6} y={504.8} size={15.1} weight={700}>
        {data.driverAddress}
      </Fit>

      <C cx={398.9} y={534.3} size={16.5} weight={700} color={RED}>
        If this is NOT your driver,
      </C>
      <C cx={400.6} y={553.0} size={16.5} weight={700} color={RED}>
        please call CTMS: {data.ctmsContactNumber}
      </C>

      <C cx={312.9} y={580.9} size={20.3} weight={700} color={MUTED} tracking={1.6}>
        THIS MTOP IS NON-TRANSFERABLE &amp; NOT FOR SALE
      </C>

      <C cx={306} y={613.3} size={14.6}>
        TERMS AND CONDITIONS ON THE GRANT OF THIS PERMIT:
      </C>

      {/* Terms — bullet marks are part of the artwork, so only the text sits here */}
      {TERM_LINES.map(({ text, justify, y }) => (
        <span
          key={text}
          style={{
            position: "absolute",
            left: "27.4pt",
            top: `${y}pt`,
            width: "577.9pt",
            fontFamily: "var(--card-poppins)",
            fontSize: "9.5pt",
            lineHeight: LINE_HEIGHT.poppins,
            textAlign: justify ? "justify" : "left",
            textAlignLast: justify ? "justify" : "left",
          }}
        >
          {text}
        </span>
      ))}

      <T x={11.2} y={761.1} size={12.6} weight={700}>
        For COMPLAINTS/CONCERNS, please call CTMS Hotline{" "}
        {data.ctmsContactNumber}
      </T>

      {/* Payment block */}
      <T x={16.5} y={799.4} size={12.6} weight={700}>
        OR No:
      </T>
      <T x={114.8} y={799.4} size={12.6} weight={700}>
        {data.orNumber}
      </T>
      <T x={16.5} y={813.7} size={12.6} weight={700}>
        Amount Paid:
      </T>
      <T x={114.8} y={813.7} size={12.6} weight={700}>
        {data.amountPaid}
      </T>
      <T x={16.5} y={827.9} size={12.6} weight={700}>
        Date Paid:
      </T>
      <T x={114.8} y={827.9} size={12.6} weight={700}>
        {data.datePaid}
      </T>

      {/* Regenerated cards show the officials currently configured by Admin. */}
      {data.treasurerSignatureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.treasurerSignatureUrl} alt="City Treasurer signature" style={{ position: "absolute", left: "35pt", top: "846pt", width: "137pt", height: "34pt", objectFit: "contain" }} />
      )}
      <CenteredFit cx={103.7} y={882.7} size={12.6} width={185}>
        {data.treasurerName || "SIGNATORY NOT CONFIGURED"}
      </CenteredFit>
      <C cx={103.6} y={897.0} size={12.6} weight={700}>
        {data.treasurerDesignation}
      </C>

      <T x={281.8} y={784.0} size={19.6}>
        APPROVED:
      </T>
      {data.mayorSignatureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.mayorSignatureUrl} alt="City Mayor signature" style={{ position: "absolute", left: "357pt", top: "806pt", width: "170pt", height: "46pt", objectFit: "contain" }} />
      )}
      <CenteredFit cx={442.3} y={855.7} size={data.mayorName ? 19.6 : 12} width={300}>
        {data.mayorName || "SIGNATORY NOT CONFIGURED"}
      </CenteredFit>
      <C cx={442.3} y={877.4} size={19.6} italic>
        {data.mayorDesignation}
      </C>
      <C cx={442.3} y={899.2} size={19.6} italic>
        Ozamiz City
      </C>
      </div>
    </div>
  )
}
