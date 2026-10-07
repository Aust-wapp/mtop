import Image from "next/image"
import { PAPER_FORMS, type FormKind, type PaperBox, type PaperSection } from "@/lib/forms/print-data"

function FormBox({ box }: { box: PaperBox }) {
  return (
    <section className="paper-box">
      <h2>{box.title}</h2>
      {box.rows.map((row, index) => (
        <div className="paper-row" key={index}>
          {row.map((entry) => (
            <div className={`paper-field${entry.wide ? " paper-field-wide" : ""}`} key={entry.label}>
              <span className="paper-label">{entry.label}:</span>
              <span className="paper-writing-line" aria-hidden="true" />
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}

function FormSection({ section }: { section: PaperSection }) {
  if (section.kind === "box") {
    return <FormBox box={section.box} />
  }

  if (section.kind === "paired-boxes") {
    return (
      <div className="paper-paired-boxes">
        {section.boxes.map((box) => (
          <FormBox box={box} key={box.title} />
        ))}
      </div>
    )
  }

  return (
    <section className="paper-reason">
      <h2>Reason</h2>
      <div className="paper-choices">
        {section.choices.map((choice) => (
          <span key={choice}><span className="paper-checkbox" aria-hidden="true" />{choice}</span>
        ))}
      </div>
      <div className="paper-remarks" aria-label="Handwritten reason or remarks">
        {Array.from({ length: section.lines }, (_, index) => <span key={index} />)}
      </div>
    </section>
  )
}

/** One independent, pen-fillable half-sheet. The printable sheet renders it twice. */
export function ApplicationPaper({ kind }: { kind: FormKind }) {
  const form = PAPER_FORMS[kind]

  return (
    <article className={`application-paper application-paper--${kind}`} aria-label={`${form.title} blank application`}>
      <Image
        src="/logo2.png"
        alt=""
        aria-hidden="true"
        width={300}
        height={300}
        className="paper-watermark"
      />
      <header className="paper-header">
        <div className="paper-header-inner">
          <div className="paper-header-logos">
            <Image src="/logo1.png" alt="Bagong Pilipinas" width={32} height={32} />
            <Image src="/logo2.png" alt="City of Ozamiz seal" width={32} height={32} className="paper-city-seal" />
          </div>
          <div className="paper-heading">
            <span>Republic of the Philippines</span>
            <strong>CITY GOVERNMENT OF OZAMIZ</strong>
          </div>
          <div className="paper-header-logos paper-header-logos-right">
            <Image src="/logo3.png" alt="Asenso Misamis Occidental" width={32} height={32} />
            <Image src="/logo4.png" alt="Asenso Ozamiz" width={44} height={32} />
          </div>
        </div>
      </header>
      <h1 className="paper-title">APPLICATION FORM : {form.title}</h1>
      <div className="paper-date">Application Date: <span className="paper-writing-line" aria-hidden="true" /></div>
      <div className="paper-content">
        {form.sections.map((section, index) => <FormSection section={section} key={index} />)}
      </div>
      {form.payment && (
        <div className="paper-payment">Office payment / O.R. No.: __________________ &nbsp; Date: ______________</div>
      )}
      <div className="paper-signature">
        <span className="paper-writing-line" aria-hidden="true" />
        <strong>APPLICANT&apos;S SIGNATURE OVER PRINTED NAME</strong>
      </div>
      {form.declaration && (
        <p className="paper-declaration">I apply for the franchise transaction described above and agree to comply with the ordinances and rules of the City Government of Ozamiz.</p>
      )}
    </article>
  )
}
