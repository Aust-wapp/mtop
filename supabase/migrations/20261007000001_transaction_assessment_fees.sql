-- Store the annual confirmation and re-issuance transaction fees separately
-- from the standard Confirmation Fee and the other assessment line items.
-- Existing assessment amounts and totals remain unchanged; historical rows get
-- zero for these newly introduced fee columns.

ALTER TABLE mtop.mtop_assessments
  ADD COLUMN annual_confirmation_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN reissuance_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN mtop.mtop_assessments.annual_confirmation_fee IS
  'Annual Confirmation Slip transaction fee. Standard confirmation_fee remains a separate fee.';

COMMENT ON COLUMN mtop.mtop_assessments.reissuance_fee IS
  'Re-Issuance of Franchise transaction fee.';
