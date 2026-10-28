import type {
  ChangeUnitCertificateData,
  ClosureCertificateData,
  CertificateVehicle,
} from "@/lib/actions/certificates"

const SERIF = '"Times New Roman", Times, serif'

function CertificateLetterhead() {
  return (
    <header className="certificate-letterhead">
      <div className="certificate-logos">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo1.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo2.png" alt="" />
      </div>
      <div className="certificate-office">
        <div>REPUBLIC OF THE PHILIPPINES</div>
        <strong>CITY TREASURER&apos;S OFFICE</strong>
        <strong>OZAMIZ CITY</strong>
        <small>Telephone No. (088) 521-2396</small>
        <small>Email Address: cto.ozamiz@gmail.com</small>
      </div>
      <div className="certificate-logos certificate-logos-right">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo3.png" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo4.png" alt="" />
      </div>
    </header>
  )
}

function VehicleDetails({
  title,
  vehicle,
}: {
  title: string
  vehicle: CertificateVehicle
}) {
  const rows = [
    ["Brand", vehicle.make],
    ["Engine No.", vehicle.motorNumber],
    ["Chassis No.", vehicle.chassisNumber],
    ["Plate No.", vehicle.plateNumber],
  ] as const

  return (
    <section className="certificate-vehicle">
      <strong>{title}</strong>
      <dl>
        {rows.map(([label, value]) => (
          <div className="certificate-vehicle-row" key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function CertificationFooter({
  data,
}: {
  data: ChangeUnitCertificateData | ClosureCertificateData
}) {
  return (
    <>
      <p className="certificate-purpose">
        THIS CERTIFICATION is issued upon request of herein interested party
        for whatever legal purpose it may serve.
      </p>
      <p className="certificate-given">
        GIVEN this {data.givenDate} Ozamiz City, Philippines.
      </p>

      <div className="certificate-signature-spacer" aria-hidden="true" />

      <div className="certificate-issuance-block">
        <div className="certificate-signature">
          <div className="certificate-signature-space" aria-hidden="true" />
          <strong className="certificate-signatory-name">
            {data.cityTreasurerName || "CITY TREASURER"}
          </strong>
          <span>City Treasurer</span>
        </div>

        <dl className="certificate-issuance">
          <div>
            <dt>Certification Fee:</dt>
            <dd>{data.certificationFee}</dd>
          </div>
          <div>
            <dt>O. R. NO.</dt>
            <dd>{data.orNumber}</dd>
          </div>
          <div>
            <dt>Date Issued</dt>
            <dd>{data.issueDate}</dd>
          </div>
          <div>
            <dt>Issued at:</dt>
            <dd>Ozamiz City</dd>
          </div>
        </dl>
      </div>

      <div className="certificate-footer-spacer" aria-hidden="true" />

      <footer className="certificate-address">
        Mayor Fernando T. Bernad Memorial Hall, Don Anselmo Bernad Avenue,
        Ozamiz City, Philippines
      </footer>
    </>
  )
}

export function ChangeUnitCertificate({
  data,
}: {
  data: ChangeUnitCertificateData
}) {
  return (
    <main className="print-card-page certificate-preview">
      <article
        className="mtop-certificate mtop-certificate-change-unit"
        style={{ fontFamily: SERIF }}
      >
        <CertificateLetterhead />

        <h1>CERTIFICATION</h1>
        <p className="certificate-salutation">TO WHOM IT MAY CONCERN:</p>

        <p className="certificate-copy">
          This is to <strong>CERTIFY</strong> that, {" "}
          <strong className="certificate-operator-name">
            {data.applicantName}
          </strong>
          , a resident of{" "}
          <span className="certificate-applicant-address">
            {data.applicantAddress}
          </span>
          , is the operator of
          Motorized Tricycle Operator&apos;s Permit No. {" "}
          <strong>{data.mtopNumber}</strong>. The previously registered
          motorized vehicle (motorcycle) had the following details:
        </p>

        <VehicleDetails title="Previous unit" vehicle={data.previousUnit} />

        <p className="certificate-copy certificate-transition">
          And based on available records, the operator changed the unit under
          M.T.O.P. No. <strong>{data.mtopNumber}</strong> to:
        </p>

        <VehicleDetails title="Replacement unit" vehicle={data.newUnit} />
        <CertificationFooter data={data} />
      </article>
    </main>
  )
}

export function ClosureCertificate({
  data,
}: {
  data: ClosureCertificateData
}) {
  return (
    <main className="print-card-page certificate-preview">
      <article
        className="mtop-certificate mtop-certificate-closure"
        style={{ fontFamily: SERIF }}
      >
        <CertificateLetterhead />

        <h1>CERTIFICATION</h1>
        <p className="certificate-salutation">TO WHOM IT MAY CONCERN:</p>

        <p className="certificate-copy certificate-closure-copy">
          THIS IS TO CERTIFY that based on records available in this office,
          M.T.O.P. NO. <strong>{data.mtopNumber}</strong>, MAKE/TYPE:{" "}
          <strong className="certificate-vehicle-value">
            {data.vehicle.make || "—"}
          </strong>, MOTOR/ENGINE NO.{" "}
          <strong className="certificate-vehicle-value">
            {data.vehicle.motorNumber || "—"}
          </strong>, CHASSIS NO.{" "}
          <strong className="certificate-vehicle-value">
            {data.vehicle.chassisNumber || "—"}
          </strong>, and PLATE NO.{" "}
          <strong className="certificate-vehicle-value">
            {data.vehicle.plateNumber || "—"}
          </strong>, owned and operated
          by <strong className="certificate-operator-name">
            {data.applicantName}
          </strong> of{" "}
          <span className="certificate-applicant-address">
            {data.applicantAddress}
          </span>
          , who had ceased to operate his
          Motorized Tricycle Operator Permit
          {data.closureDate ? (
            <>
              {" "}on {data.closureDate}
            </>
          ) : null}
          .
        </p>

        <CertificationFooter data={data} />
      </article>
    </main>
  )
}
