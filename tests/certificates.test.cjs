/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ReactDOMServer = require("react-dom/server")
const typescript = require("typescript")

function loadTypeScriptModule(relativePath, mockedModules = {}) {
  const filePath = path.join(__dirname, relativePath)
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }).outputText
  const transpiledModule = { exports: {} }
  const mockedRequire = (moduleName) =>
    Object.hasOwn(mockedModules, moduleName)
      ? mockedModules[moduleName]
      : require(moduleName)

  new Function("require", "module", "exports", compiled)(
    mockedRequire,
    transpiledModule,
    transpiledModule.exports
  )

  return transpiledModule.exports
}

const officeTime = loadTypeScriptModule("../src/lib/office-time.ts")
const certificateFormat = loadTypeScriptModule(
  "../src/lib/certificate-format.ts",
  { "@/lib/office-time": officeTime }
)
const certificateAccess = loadTypeScriptModule(
  "../src/lib/certificate-access.ts"
)
const certificateComponents = loadTypeScriptModule(
  "../src/components/mtop/transaction-certificate.tsx"
)
const schemas = loadTypeScriptModule("../src/lib/schemas/mtop.ts", {
  "@/lib/fees": { isValidLostPlateReplacementFee: () => true },
  "@/lib/operator-name": {
    findCoOwnerMarker: () => null,
    SINGLE_OPERATOR_MESSAGE: "",
  },
})

let certificateQueryResults = {}

function createQuery(result) {
  const query = {
    select() {
      return this
    },
    eq() {
      return this
    },
    gt() {
      return this
    },
    order() {
      return this
    },
    limit() {
      return this
    },
    maybeSingle() {
      return Promise.resolve(result)
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }

  return query
}

const certificateActions = loadTypeScriptModule(
  "../src/lib/actions/certificates.ts",
  {
    "@/lib/address": {
      displayAddress: () => "Purok 5, Ozamiz City",
    },
    "@/lib/certificate-format": certificateFormat,
    "@/lib/certificate-access": certificateAccess,
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "staff-user" } },
            error: null,
          }),
        },
        schema: () => ({
          from: (table) =>
            createQuery(
              certificateQueryResults[table] ?? { data: null, error: null }
            ),
        }),
      }),
    },
  }
)

test("certificate dates use the Ozamiz calendar day and natural ordinals", () => {
  const grantTimestamp = "2026-10-27T16:00:00.000Z"

  assert.equal(
    certificateFormat.formatCertificateDate(grantTimestamp),
    "October 28, 2026"
  )
  assert.equal(
    certificateFormat.formatCertificateGivenDate(grantTimestamp),
    "28th day of October, 2026"
  )
  assert.equal(certificateFormat.ordinalSuffix(21), "st")
  assert.equal(certificateFormat.ordinalSuffix(22), "nd")
  assert.equal(certificateFormat.ordinalSuffix(23), "rd")
  assert.equal(certificateFormat.ordinalSuffix(11), "th")
})

test("closure access selects only the newest Granted Closure application", () => {
  const selected = certificateAccess.findLatestGrantedClosureApplication([
    {
      id: "new-franchise",
      status: "granted",
      granted_at: "2024-01-01T00:00:00.000Z",
      transaction_type: { code: "new_franchise" },
    },
    {
      id: "pending-closure",
      status: "for_approval",
      granted_at: null,
      transaction_type: { code: "closure" },
    },
    {
      id: "older-closure",
      status: "granted",
      granted_at: "2025-01-01T00:00:00.000Z",
      transaction_type: { code: "closure" },
    },
    {
      id: "latest-closure",
      status: "granted",
      granted_at: "2026-01-01T00:00:00.000Z",
      transaction_type: { code: "closure" },
    },
  ])

  assert.equal(selected.id, "latest-closure")
})

test("closed franchise lookup returns its approved Closure application ID", async () => {
  certificateQueryResults = {
    mtop_franchises: {
      data: { franchise_status: "closed" },
      error: null,
    },
    mtop_applications: {
      data: [
        {
          id: "new-franchise",
          status: "granted",
          granted_at: "2024-01-01T00:00:00.000Z",
          transaction_type: { code: "new_franchise" },
        },
        {
          id: "closure-application",
          status: "granted",
          granted_at: "2026-01-01T00:00:00.000Z",
          transaction_type: { code: "closure" },
        },
      ],
      error: null,
    },
  }

  const result =
    await certificateActions.getGrantedClosureApplicationIdForFranchise(
      "closed-franchise"
    )

  assert.deepEqual(result, {
    error: null,
    applicationId: "closure-application",
  })
})

test("closed franchise without an approved Closure has no certificate target", async () => {
  certificateQueryResults = {
    mtop_franchises: {
      data: { franchise_status: "closed" },
      error: null,
    },
    mtop_applications: {
      data: [
        {
          id: "pending-closure",
          status: "for_approval",
          granted_at: null,
          transaction_type: { code: "closure" },
        },
      ],
      error: null,
    },
  }

  const result =
    await certificateActions.getGrantedClosureApplicationIdForFranchise(
      "closed-franchise"
    )

  assert.deepEqual(result, { error: null, applicationId: null })
})

test("an open franchise has no Closure certificate target", async () => {
  certificateQueryResults = {
    mtop_franchises: {
      data: { franchise_status: "active" },
      error: null,
    },
    mtop_applications: {
      data: [
        {
          id: "closure-application",
          status: "granted",
          granted_at: "2026-01-01T00:00:00.000Z",
          transaction_type: { code: "closure" },
        },
      ],
      error: null,
    },
  }

  const result =
    await certificateActions.getGrantedClosureApplicationIdForFranchise(
      "active-franchise"
    )

  assert.deepEqual(result, { error: null, applicationId: null })
})

test("certification fee uses the stored amount with two decimal places", () => {
  assert.equal(certificateFormat.formatCertificationFee(100), "₱100.00")
  assert.equal(certificateFormat.formatCertificationFee("1250.5"), "₱1,250.50")
  assert.equal(certificateFormat.formatCertificationFee(null), "")
})

test("change-unit form requires the replacement make for new applications", () => {
  const fields = {
    franchise_id: "c7d88cb2-c843-4b4f-9cf8-3dc913b4c9b6",
    transaction_type_code: "change_unit",
    new_motor_number: "MOTOR-2",
    new_chassis_number: "CHASSIS-2",
  }
  const missingMake = schemas.franchiseTransactionSchema.safeParse(fields)

  assert.equal(missingMake.success, false)
  assert.ok(
    missingMake.error.issues.some((issue) => issue.path[0] === "new_make")
  )
  assert.equal(
    schemas.franchiseTransactionSchema.safeParse({
      ...fields,
      new_make: "Kawasaki",
    }).success,
    true
  )
})

test("change-unit certificate prints the applicant and both recorded units", () => {
  const html = ReactDOMServer.renderToStaticMarkup(
    require("react/jsx-runtime").jsx(
      certificateComponents.ChangeUnitCertificate,
      {
        data: {
          kind: "change_unit",
          mtopNumber: "AO-2026-00001",
          applicantName: "A. Operator",
          applicantAddress: "Purok 5, Ozamiz City",
          givenDate: "26th day of October, 2026",
          certificationFee: "₱100.00",
          orNumber: "6350678",
          issueDate: "October 27, 2026",
          cityTreasurerName: "TEST CITY TREASURER",
          previousUnit: {
            make: "Honda",
            motorNumber: "MOTOR-1",
            chassisNumber: "CHASSIS-1",
            plateNumber: "PLATE-1",
          },
          newUnit: {
            make: "Kawasaki",
            motorNumber: "MOTOR-2",
            chassisNumber: "CHASSIS-2",
            plateNumber: "PLATE-2",
          },
        },
      }
    )
  )

  assert.match(html, /A\. Operator/)
  assert.match(html, /This is to <strong>CERTIFY<\/strong> that,/)
  assert.match(html, /certificate-operator-name/)
  assert.match(html, /certificate-applicant-address/)
  assert.match(html, /MOTOR-1/)
  assert.match(html, /MOTOR-2/)
  assert.match(html, /Kawasaki/)
  assert.match(html, /6350678/)
})

test("closure certificate prints the franchise unit and cessation date", () => {
  const closureData = {
    kind: "closure",
    mtopNumber: "AO-2026-00002",
    bodyNumber: "CAB-UNIT-0002",
    applicantName: "B. Operator",
    applicantAddress: "Purok 8, Ozamiz City",
    givenDate: "27th day of October, 2026",
    closureDate: "October 26, 2026",
    certificationFee: "₱100.00",
    orNumber: "6350679",
    issueDate: "October 27, 2026",
    cityTreasurerName: "TEST CITY TREASURER",
    vehicle: {
      make: "Honda",
      motorNumber: "MOTOR-C",
      chassisNumber: "CHASSIS-C",
      plateNumber: "PLATE-C",
    },
  }
  const html = ReactDOMServer.renderToStaticMarkup(
    require("react/jsx-runtime").jsx(certificateComponents.ClosureCertificate, {
      data: closureData,
    })
  )

  assert.match(html, /B\. Operator/)
  assert.match(html, /THIS IS TO CERTIFY that based on records available in this office/)
  assert.match(html, /certificate-applicant-address/)
  assert.match(html, /M\.T\.O\.P\. NO\./)
  assert.match(
    html,
    /M\.T\.O\.P\. NO\. <strong>AO-2026-00002<\/strong>, CAB NO\. <strong class="certificate-vehicle-value">CAB-UNIT-0002<\/strong>, MAKE\/TYPE:/
  )
  assert.match(html, /MAKE\/TYPE:/)
  assert.match(html, /MAKE\/TYPE: <strong class="certificate-vehicle-value">Honda/)
  assert.match(html, /MOTOR\/ENGINE NO\./)
  assert.match(html, /CHASSIS NO\./)
  assert.match(html, /PLATE NO\./)
  assert.match(html, /who had ceased to operate his Motorized Tricycle Operator Permit/)
  assert.match(html, /MOTOR-C/)
  assert.match(html, /October 26, 2026/)
  assert.match(html, /27th day of October, 2026/)
  assert.match(html, /O\. R\. NO\./)
  assert.match(html, /THIS CERTIFICATION is issued upon request of herein interested party/)

  const htmlWithoutBodyNumber = ReactDOMServer.renderToStaticMarkup(
    require("react/jsx-runtime").jsx(certificateComponents.ClosureCertificate, {
      data: { ...closureData, bodyNumber: "" },
    })
  )
  assert.match(
    htmlWithoutBodyNumber,
    /CAB NO\. <strong class="certificate-vehicle-value">—<\/strong>, MAKE\/TYPE:/
  )
})

test("change-unit data loads applicant, vehicle history, fee, and receipt", async () => {
  certificateQueryResults = {
    mtop_applications: {
      data: {
        id: "change-app",
        status: "granted",
        granted_at: "2026-10-27T16:00:00.000Z",
        new_make: "Kawasaki",
        transaction_type: { code: "change_unit" },
        franchise: {
          id: "franchise-1",
          mtop_number: "AO-2026-00001",
          applicant_name: "Current Owner",
          make: "Suzuki",
        },
      },
      error: null,
    },
    mtop_payments: {
      data: [{ or_number: "6350678", payment_date: "2026-10-27" }],
      error: null,
    },
    mtop_assessments: { data: { certification_fee: 100 }, error: null },
    system_settings: { data: { value: "TEST CITY TREASURER" }, error: null },
    franchise_unit_history: {
      data: {
        previous_make: "Honda",
        previous_motor_number: "MOTOR-1",
        previous_chassis_number: "CHASSIS-1",
        previous_plate_number: "PLATE-1",
        new_make: "Kawasaki",
        new_motor_number: "MOTOR-2",
        new_chassis_number: "CHASSIS-2",
        new_plate_number: "PLATE-2",
      },
      error: null,
    },
    franchise_ownership_history: {
      data: [
        {
          previous_applicant_name: "A. Operator",
          previous_applicant_address: "Purok 5, Ozamiz City",
        },
      ],
      error: null,
    },
  }

  const result = await certificateActions.getGrantedCertificateData(
    "change-app",
    "change_unit"
  )

  assert.equal(result.error, null)
  assert.equal(result.data.applicantName, "A. Operator")
  assert.equal(result.data.mtopNumber, "AO-2026-00001")
  assert.equal(result.data.previousUnit.make, "Honda")
  assert.equal(result.data.previousUnit.motorNumber, "MOTOR-1")
  assert.equal(result.data.newUnit.make, "Kawasaki")
  assert.equal(result.data.newUnit.motorNumber, "MOTOR-2")
  assert.equal(result.data.certificationFee, "₱100.00")
  assert.equal(result.data.orNumber, "6350678")
  assert.equal(result.data.issueDate, "October 27, 2026")
  assert.equal(result.data.givenDate, "28th day of October, 2026")
  assert.equal(result.data.cityTreasurerName, "TEST CITY TREASURER")
})

test("closure data loads current franchise unit and closure date", async () => {
  certificateQueryResults = {
    mtop_applications: {
      data: {
        id: "closure-app",
        status: "granted",
        granted_at: null,
        transaction_type: { code: "closure" },
        franchise: {
          id: "franchise-2",
          mtop_number: "AO-2026-00002",
          tricycle_body_number: "CAB-UNIT-0002",
          applicant_name: "B. Operator",
          make: "Honda",
          motor_number: "MOTOR-C",
          chassis_number: "CHASSIS-C",
          plate_number: "PLATE-C",
          closed_at: "2026-10-26T16:00:00.000Z",
        },
      },
      error: null,
    },
    mtop_payments: { data: [], error: null },
    mtop_assessments: { data: { certification_fee: 100 }, error: null },
    system_settings: { data: null, error: null },
  }

  const result = await certificateActions.getGrantedCertificateData(
    "closure-app",
    "closure"
  )

  assert.equal(result.error, null)
  assert.equal(result.data.applicantName, "B. Operator")
  assert.equal(result.data.bodyNumber, "CAB-UNIT-0002")
  assert.equal(result.data.vehicle.make, "Honda")
  assert.equal(result.data.vehicle.motorNumber, "MOTOR-C")
  assert.equal(result.data.givenDate, "27th day of October, 2026")
  assert.equal(result.data.orNumber, "")
  assert.equal(result.data.issueDate, "")
  assert.equal(result.data.cityTreasurerName, "")
})

test("assessed Change Unit fee never fabricates payment proof", async () => {
  certificateQueryResults = {
    mtop_applications: {
      data: {
        id: "change-app-no-cert-fee",
        status: "granted",
        granted_at: null,
        transaction_type: { code: "change_unit" },
        franchise: {
          id: "franchise-no-cert-fee",
          mtop_number: "AO-2026-00003",
          applicant_name: "C. Operator",
        },
      },
      error: null,
    },
    mtop_payments: { data: [], error: null },
    mtop_assessments: { data: { certification_fee: 100 }, error: null },
    system_settings: { data: { value: "CITY TREASURER" }, error: null },
    franchise_unit_history: {
      data: {
        previous_make: "Honda",
        new_make: "Kawasaki",
      },
      error: null,
    },
  }

  const result = await certificateActions.getGrantedCertificateData(
    "change-app-no-cert-fee",
    "change_unit"
  )

  assert.equal(result.error, null)
  assert.equal(result.data.certificationFee, "₱100.00")
  assert.equal(result.data.orNumber, "")
  assert.equal(result.data.issueDate, "")

  certificateQueryResults.mtop_assessments.data.certification_fee = 0
  const unselectedResult = await certificateActions.getGrantedCertificateData(
    "change-app-no-cert-fee",
    "change_unit"
  )

  assert.equal(unselectedResult.data.certificationFee, "₱0.00")
  assert.equal(unselectedResult.data.orNumber, "")
  assert.equal(unselectedResult.data.issueDate, "")
})

test("a pending Closure application cannot generate a certificate", async () => {
  certificateQueryResults = {
    mtop_applications: {
      data: {
        id: "pending-closure",
        status: "for_approval",
        transaction_type: { code: "closure" },
        franchise: { id: "franchise-2" },
      },
      error: null,
    },
  }

  const result = await certificateActions.getGrantedCertificateData(
    "pending-closure",
    "closure"
  )

  assert.equal(result.data, null)
  assert.match(result.error, /only available for granted Closure applications/)
})

test("certificate print sheet selects a separate A4 portrait page", () => {
  const styles = fs.readFileSync(
    path.join(__dirname, "../src/app/print/print.css"),
    "utf8"
  )

  assert.match(styles, /@page\s*\{[^}]*size:\s*A4 portrait/s)
  assert.match(styles, /@page\s+mtop-long-bond\s*\{[^}]*size:\s*8\.5in 13in/s)
  assert.doesNotMatch(styles, /page:\s*mtop-certificate/)
  assert.match(styles, /\.mtop-card,\s*\.mtop-slip\s*\{[^}]*page:\s*mtop-long-bond/s)
  assert.match(styles, /height:\s*297mm/)
  assert.match(styles, /\.certificate-purpose\s*\{[^}]*margin:\s*5mm 0 0/s)
  assert.match(styles, /\.certificate-copy\s*\{[^}]*text-indent:\s*8mm/s)
  assert.match(styles, /\.certificate-purpose\s*\{[^}]*text-indent:\s*8mm/s)
  assert.match(styles, /\.certificate-given\s*\{[^}]*text-indent:\s*0/s)
  assert.match(styles, /\.certificate-given\s*\{[^}]*text-align:\s*center/s)
  assert.match(styles, /\.certificate-signature-spacer\s*\{[^}]*min-height:\s*0/s)
  assert.match(styles, /\.certificate-signature-space\s*\{[^}]*height:\s*16mm/s)
  assert.match(styles, /\.certificate-issuance-block\s*\{[^}]*margin:\s*0 0 0 6mm/s)
  assert.match(styles, /\.certificate-footer-spacer\s*\{[^}]*min-height:\s*6mm/s)
  assert.match(styles, /\.certificate-address\s*\{[^}]*margin-top:\s*0/s)
  assert.match(styles, /\.mtop-certificate-closure h1\s*\{[^}]*margin-bottom:\s*21mm/s)
  assert.match(styles, /\.mtop-certificate-closure \.certificate-purpose\s*\{[^}]*margin-top:\s*13mm/s)
  assert.match(styles, /\.mtop-certificate-closure \.certificate-given\s*\{[^}]*margin-top:\s*20mm/s)
  assert.match(styles, /\.mtop-certificate-closure \.certificate-signature-spacer\s*\{[^}]*max-height:\s*17mm/s)
  assert.match(styles, /\.mtop-certificate-change-unit \.certificate-signature-spacer\s*\{[^}]*flex:\s*0 0 9mm/s)
  assert.match(styles, /\.mtop-certificate-change-unit \.certificate-signature-spacer\s*\{[^}]*max-height:\s*9mm/s)
  assert.match(styles, /\.mtop-certificate\s*\{[^}]*font-size:\s*12pt/s)
  assert.match(styles, /\.mtop-certificate h1\s*\{[^}]*font-size:\s*17pt/s)
  assert.match(styles, /\.mtop-certificate h1\s*\{[^}]*letter-spacing:\s*0\.28em/s)
  assert.match(styles, /\.certificate-operator-name,\s*\.certificate-signatory-name\s*\{[^}]*text-transform:\s*uppercase/s)
  assert.match(styles, /\.certificate-vehicle-value\s*\{[^}]*text-transform:\s*uppercase/s)
  assert.match(
    styles,
    /body:has\(\.certificate-preview\)\s*\{[^}]*display:\s*block/s
  )
  assert.match(styles, /\.mtop-certificate\s*\{[^}]*min-height:\s*297mm/s)
  assert.match(styles, /@media print\s*\{[\s\S]*?\.mtop-certificate\s*\{[^}]*min-height:\s*0/s)
  assert.match(styles, /@media print\s*\{[\s\S]*?\.mtop-certificate\s*\{[^}]*break-inside:\s*auto/s)

  const component = fs.readFileSync(
    path.join(__dirname, "../src/components/mtop/transaction-certificate.tsx"),
    "utf8"
  )
  assert.ok(
    component.indexOf('className="certificate-signature"') <
      component.indexOf('className="certificate-issuance"'),
    "The receipt details should follow the treasurer signatory block."
  )
})
