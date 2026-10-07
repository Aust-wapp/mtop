# Blank application forms: field and reference map

The seven templates in `src/lib/forms/print-data.ts` use the supplied City
Government forms in `docs/form-references/` as their visual and structural
reference. The filing screens in `src/app/dashboard/applications/new/`,
`src/lib/schemas/mtop.ts`, and `src/lib/actions/applications.ts` determine
which application values staff encode. Each template is rendered twice by
`FormPreview` on one A4 sheet. Applicant forms remain blank and printing does
not write to the database.

The paper retains some **office-only** areas from the references: application
date, handwritten reason, applicant signature, and payment/O.R. area where
shown. These are not new digital filing fields. Tracker, Received By, and Date
Posted boxes were removed from the seven blank applicant forms to leave more
usable writing space.
The New and Renewal driver name, license number, and address are also retained
on paper. MTOP stores those values later on the franchise card, outside the
application filing screen. Staff should not expect those paper entries to be
encoded automatically by this print feature.

| Form | Current filing values represented on paper | Reference structure and intentional changes |
| --- | --- | --- |
| New Franchise | Applicant name, contact, barangay, purok; body/cab, plate, motor, chassis, make, day off, association, route. | New Franchise scan: official header, owner/driver area, boxed unit description, declaration/signature. Driver name/license/address are retained paper-only. The old birth dates, license expiry, cab type and LTO O.R. expiry are omitted because MTOP does not collect them. |
| Renewal of Franchise | Existing MTOP, owner, motor/chassis; editable barangay, purok, contact, plate, body, route, make, day off, association, due date. | Renewal scan: owner/driver and boxed unit areas. Driver name/license/address are paper-only. Old birth dates, license expiry, cab type and LTO O.R. expiry are omitted. |
| Change of Ownership | Locked current MTOP/owner/motor/chassis; unit plate/body/route/make/day off/association/due date; new owner name, barangay, purok, contact. | Ownership scan: distinct boxed Current Owner/New Owner and boxed unit. Current contact is an office-only reference entry because digital filing keeps current owner contact locked. The old driver/birth date/license fields and cab type are omitted. |
| Motor Vehicle Change Unit | Locked MTOP/owner and old motor/chassis/plate; editable barangay, purok, contact, body, route, make, day off, association, due date; staged new motor/chassis/plate. | Change Unit scan: two distinct old/new unit boxes. Historic MV file, color, year model, registration/certificate/receipt fields are omitted because they are absent from current filing. |
| Closure of Franchise | Existing MTOP/owner/motor/chassis; shared editable barangay, purok, contact, plate, body, route, make, day off, association, due date. | Closure scan: franchise identity, boxed Reason and Unit Description, signature. Reason choices and remarks are paper-only; the filing schema has no closure-reason field. |
| Confirmation Slip | Existing MTOP/owner/motor/chassis; shared editable barangay, purok, contact, plate, body, route, make, day off, association, due date. | Confirmation Slip scan: reason checkboxes/remarks and office payment area are paper-only. The corresponding filing transaction is `annual_confirmation`; it does not have a separate reason or payment input. This blank form is separate from the generated granted LTO confirmation document at `/print/confirmation/[id]`. |
| Re-Issuance of Franchise | Existing MTOP/owner/motor/chassis; shared editable barangay, purok, contact, plate, body, route, make, day off, association, due date. | Re-Issuance scan: requester/franchise identity, reason, and payment areas. Reference reason choices are paper-only; fixed historic prices were removed because current pricing is not represented by the filing screen. |

Printed labels omit “(optional)” while digital validation remains unchanged.
The New Franchise schema accepts `due_date`, but its filing screen does not
display it, so the New paper form omits it. The existing-franchise forms show
MTOP/owner/motor/chassis as identity values even though those are locked in the
digital workflow. Change Unit replacement identifiers are staged until grant.

All seven use A4 portrait, top/bottom, because each half has the wider
handwriting surface needed for names, addresses, routes, and long unit
identifiers. Change Unit retains side-by-side old/new boxes within each half;
A4 landscape would make each independent form narrower. The dashed center
line is the cutting guide. Generated QA PDFs are local, ignored artifacts in
`output/pdf/`.
