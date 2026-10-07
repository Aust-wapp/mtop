// Auto-generated types for mtop schema
// Run `npx supabase gen types typescript --project-id <id>` to regenerate

export type MtopStatus =
  | "for_verification"
  | "for_inspection"
  | "for_assessment"
  | "for_approval"
  | "granted"
  | "rejected"
  | "returned"

// The seven transactions the city runs over a franchise. Codes are stable;
// everything else about a transaction (label, checklist, fees) is reference
// data in mtop.transaction_types / mtop.transaction_requirements.
export type TransactionTypeCode =
  | "new_franchise"
  | "renewal"
  | "annual_confirmation"
  | "change_unit"
  | "change_ownership"
  | "reissuance"
  | "closure"

// What granting an application does to its franchise.
export type GrantEffect =
  | "issue_number"
  | "extend_validity"
  | "replace_unit"
  | "transfer_owner"
  | "confirm_year"
  | "reprint_permit"
  | "close_franchise"

// A checklist row is not always a file to upload — see the migration comment
// in 20260413000014_requirements_matrix.sql.
export type RequirementKind =
  | "document"
  | "payment"
  | "inspection"
  | "appearance"
  | "photo"
  | "surrender"

export type FranchiseStatus =
  | "active"
  | "closed"
  | "abandoned"
  | "revoked"
  | "cancelled"

export type ApprovalAction = "approved" | "rejected" | "returned" | "forwarded"

export type InspectionResult = "passed" | "failed"

export interface UserProfile {
  id: string
  division_id: string | null
  full_name: string
  email: string
  avatar_url: string | null
  created_at: string
}

export interface Role {
  id: string
  name: string
  code: string
  description: string | null
}

export interface Permission {
  id: string
  code: string
  description: string | null
}

export interface UserRole {
  id: string
  user_id: string
  role_id: string
  granted_at: string
}

export interface RolePermission {
  role_id: string
  permission_id: string
}

export interface MtopFranchise {
  id: string
  mtop_number: string | null
  // Composed "First Middle Last Suffix" from the parts below — the column
  // everything else reads. The parts are NULL on franchises registered before
  // 20260413000030.
  applicant_name: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  suffix: string | null
  applicant_address: string | null
  contact_number: string | null
  tricycle_body_number: string | null
  plate_number: string | null
  motor_number: string
  chassis_number: string
  route: string | null
  make: string | null
  day_off: string | null
  association_id: string | null
  // Structured address (20260413000020). NULL on franchises registered before
  // it, which carry only the free-text applicant_address — see src/lib/address.ts.
  barangay: string | null
  purok: string | null
  granted_until: string | null
  franchise_status: FranchiseStatus
  closed_at: string | null
  last_confirmed_at: string | null
  last_reissued_at: string | null
  owner_photo_url: string | null
  driver_photo_url: string | null
  driver_name: string | null
  driver_license_number: string | null
  driver_address: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MtopApplication {
  id: string
  franchise_id: string
  transaction_type_id: string
  status: MtopStatus
  fiscal_year: number
  due_date: string | null
  submitted_at: string
  granted_at: string | null
  division_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Staged by createFranchiseTransaction, applied to the franchise only when
  // mtop.grant_franchise() runs the matching effect — see CLAUDE.md →
  // "Transactions and Requirements".
  new_motor_number: string | null
  new_chassis_number: string | null
  new_plate_number: string | null
  new_applicant_name: string | null
  new_last_name: string | null
  new_first_name: string | null
  new_middle_name: string | null
  new_suffix: string | null
  new_barangay: string | null
  new_purok: string | null
  new_applicant_address: string | null
  new_contact_number: string | null
  // Operator's stated reason — reissuance, closure and annual_confirmation
  // only (20260413000029).
  reason: string | null
  // One scanned PDF of the whole requirements folder — see
  // 20260413000027_requirements_bundle.sql. The per-row file_url on
  // mtop_application_requirements is still there for the document that turns
  // up on its own after the folder was scanned.
  requirements_file_url: string | null
  requirements_file_name: string | null
  requirements_file_size: number | null
  requirements_uploaded_at: string | null
  requirements_uploaded_by: string | null
}

export interface FranchiseUnitHistory {
  id: string
  franchise_id: string
  application_id: string | null
  changed_by: string | null
  changed_at: string
  previous_motor_number: string | null
  previous_chassis_number: string | null
  previous_plate_number: string | null
  new_motor_number: string
  new_chassis_number: string
  new_plate_number: string | null
}

export interface FranchiseOwnershipHistory {
  id: string
  franchise_id: string
  application_id: string | null
  changed_by: string | null
  changed_at: string
  previous_applicant_name: string
  previous_applicant_address: string | null
  previous_contact_number: string | null
  new_applicant_name: string
  new_applicant_address: string | null
  new_contact_number: string | null
}

export interface TransactionType {
  id: string
  code: TransactionTypeCode
  name: string
  description: string
  when_to_use: string
  grant_effect: GrantEffect
  requires_existing_franchise: boolean
  requires_inspection: boolean
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Association {
  id: string
  name: string
  president_name: string | null
  contact_number: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Requirement {
  id: string
  code: string
  label: string
  kind: RequirementKind
  description: string
  is_active: boolean
  created_at: string
}

export interface TransactionRequirement {
  id: string
  transaction_type_id: string
  requirement_id: string
  is_mandatory: boolean
  is_conditional: boolean
  note: string | null
  sort_order: number
}

// One checklist row on one application. Replaces the old MtopDocument — the
// table now carries payment, inspection, appearance and photo rows too.
export interface ApplicationRequirement {
  id: string
  application_id: string
  requirement_id: string
  file_url: string | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
}

// What the application detail page actually renders: the row joined to its
// catalogue entry and to this transaction's rules for it.
export interface ApplicationRequirementWithDetail extends ApplicationRequirement {
  code: string
  label: string
  kind: RequirementKind
  description: string
  is_mandatory: boolean
  is_conditional: boolean
  note: string | null
  sort_order: number
}

export interface MtopInspection {
  id: string
  application_id: string
  inspector_id: string | null
  inspection_date: string
  clean_windshields: boolean
  garbage_receptacle: boolean
  functioning_horn: boolean
  signal_lights: boolean
  tail_light: boolean
  top_chain: boolean
  headlights_taillights: boolean
  sidecar_light: boolean
  anti_noise_equipment: boolean
  body_number_sticker: boolean
  functional_mufflers: boolean
  road_worthiness: boolean
  result: InspectionResult | null
  remarks: string | null
  created_at: string
}

export interface MtopAssessment {
  id: string
  application_id: string
  assessed_by: string | null
  filing_fee: number
  supervision_fee: number
  confirmation_fee: number
  mayors_permit_fee: number
  franchise_fee: number
  police_clearance_fee: number
  health_fee: number
  legal_research_fee: number
  parking_fee: number
  late_renewal_penalty: number
  change_of_motor_fee: number
  replacement_plate_fee: number
  annual_confirmation_fee: number
  reissuance_fee: number
  certification_fee: number
  closure_fee: number
  total_amount: number
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export interface MtopPayment {
  id: string
  assessment_id: string | null
  application_id: string
  or_number: string
  amount_paid: number
  payment_date: string
  payment_method: string
  received_by: string | null
  created_at: string
}

export interface ApprovalLog {
  id: string
  application_id: string
  stage: MtopStatus
  action: ApprovalAction
  actor_id: string | null
  remarks: string | null
  created_at: string
}

/**
 * One of the 51 barangays of Ozamiz City, seeded in 20260413000020 and keyed
 * by name so a franchise row carries the readable value. Read-only: there is
 * no write policy on the table.
 */
export interface Barangay {
  name: string
  is_active: boolean
  created_at: string
}

export type AuditAction = "insert" | "update" | "delete"

/**
 * One row of mtop.audit_logs. Written only by the mtop.log_audit_change()
 * trigger (20260413000019_audit_trail.sql) — the table is append-only and has
 * no insert policy, so nothing in the app writes here.
 */
export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  franchise_id: string | null
  action: AuditAction
  /** auth.uid() at the time of the write; null for service-role/SQL writes. */
  actor_id: string | null
  /** { column: { old, new } } — only the columns that actually changed. */
  changes: Record<string, { old: unknown; new: unknown }>
  created_at: string
}

export interface MtopNegativeList {
  id: string
  applicant_name: string
  reason: string
  added_by: string | null
  is_active: boolean
  created_at: string
}

export interface SystemSetting {
  key: string
  value: unknown
  updated_by: string | null
  updated_at: string
}

// Joined types for common queries
export interface MtopApplicationWithRelations extends MtopApplication {
  franchise?: MtopFranchise | null
  transaction_type?: TransactionType | null
  requirements?: ApplicationRequirementWithDetail[]
  inspection?: MtopInspection | null
  assessment?: MtopAssessment | null
  payments?: MtopPayment[]
  approval_logs?: ApprovalLog[]
  creator?: Pick<UserProfile, "id" | "full_name" | "email"> | null
}

export interface FranchiseSearchResult extends MtopFranchise {
  // Latest application's status (if any) — used by the renewal-eligibility check.
  latest_status?: MtopStatus | null
  has_active_application?: boolean
}

export interface UserProfileWithRoles extends UserProfile {
  roles?: (UserRole & { role: Role })[]
}

// Database schema type for Supabase client typing
export interface MtopSchema {
  Tables: {
    user_profiles: {
      Row: UserProfile
      Insert: Omit<UserProfile, "created_at"> & { created_at?: string }
      Update: Partial<Omit<UserProfile, "id">>
    }
    roles: {
      Row: Role
      Insert: Omit<Role, "id"> & { id?: string }
      Update: Partial<Omit<Role, "id">>
    }
    permissions: {
      Row: Permission
      Insert: Omit<Permission, "id"> & { id?: string }
      Update: Partial<Omit<Permission, "id">>
    }
    user_roles: {
      Row: UserRole
      Insert: Omit<UserRole, "id" | "granted_at"> & { id?: string; granted_at?: string }
      Update: Partial<Omit<UserRole, "id">>
    }
    role_permissions: {
      Row: RolePermission
      Insert: RolePermission
      Update: Partial<RolePermission>
    }
    mtop_franchises: {
      Row: MtopFranchise
      Insert: Omit<
        MtopFranchise,
        | "id"
        | "created_at"
        | "updated_at"
        | "owner_photo_url"
        | "driver_photo_url"
        | "driver_name"
        | "driver_license_number"
        | "driver_address"
        | "make"
        | "day_off"
        | "franchise_status"
        | "closed_at"
        | "last_confirmed_at"
        | "last_reissued_at"
        | "association_id"
        | "barangay"
        | "purok"
        | "last_name"
        | "first_name"
        | "middle_name"
        | "suffix"
      > & {
        id?: string
        created_at?: string
        updated_at?: string
        owner_photo_url?: string | null
        driver_photo_url?: string | null
        driver_name?: string | null
        driver_license_number?: string | null
        driver_address?: string | null
        make?: string | null
        day_off?: string | null
        franchise_status?: FranchiseStatus
        closed_at?: string | null
        last_confirmed_at?: string | null
        last_reissued_at?: string | null
        association_id?: string | null
        barangay?: string | null
        purok?: string | null
        last_name?: string | null
        first_name?: string | null
        middle_name?: string | null
        suffix?: string | null
      }
      Update: Partial<Omit<MtopFranchise, "id">>
    }
    mtop_applications: {
      Row: MtopApplication
      Insert: Omit<
        MtopApplication,
        | "id"
        | "status"
        | "fiscal_year"
        | "submitted_at"
        | "created_at"
        | "updated_at"
        | "new_motor_number"
        | "new_chassis_number"
        | "new_plate_number"
        | "new_applicant_name"
        | "new_applicant_address"
        | "new_contact_number"
        | "new_barangay"
        | "new_purok"
        | "new_last_name"
        | "new_first_name"
        | "new_middle_name"
        | "new_suffix"
        | "reason"
      > & {
        id?: string
        status?: MtopStatus
        fiscal_year?: number
        submitted_at?: string
        created_at?: string
        updated_at?: string
        new_motor_number?: string | null
        new_chassis_number?: string | null
        new_plate_number?: string | null
        new_applicant_name?: string | null
        new_applicant_address?: string | null
        new_contact_number?: string | null
        new_barangay?: string | null
        new_purok?: string | null
        new_last_name?: string | null
        new_first_name?: string | null
        new_middle_name?: string | null
        new_suffix?: string | null
        reason?: string | null
      }
      Update: Partial<Omit<MtopApplication, "id">>
    }
    franchise_unit_history: {
      Row: FranchiseUnitHistory
      Insert: Omit<FranchiseUnitHistory, "id" | "changed_at"> & {
        id?: string
        changed_at?: string
      }
      Update: Partial<Omit<FranchiseUnitHistory, "id">>
    }
    franchise_ownership_history: {
      Row: FranchiseOwnershipHistory
      Insert: Omit<FranchiseOwnershipHistory, "id" | "changed_at"> & {
        id?: string
        changed_at?: string
      }
      Update: Partial<Omit<FranchiseOwnershipHistory, "id">>
    }
    transaction_types: {
      Row: TransactionType
      Insert: Omit<TransactionType, "id" | "created_at"> & { id?: string; created_at?: string }
      Update: Partial<Omit<TransactionType, "id">>
    }
    associations: {
      Row: Association
      Insert: Omit<
        Association,
        "id" | "is_active" | "sort_order" | "created_at" | "updated_at"
      > & {
        id?: string
        is_active?: boolean
        sort_order?: number
        created_at?: string
        updated_at?: string
      }
      Update: Partial<Omit<Association, "id">>
    }
    requirements: {
      Row: Requirement
      Insert: Omit<Requirement, "id" | "created_at"> & { id?: string; created_at?: string }
      Update: Partial<Omit<Requirement, "id">>
    }
    transaction_requirements: {
      Row: TransactionRequirement
      Insert: Omit<TransactionRequirement, "id"> & { id?: string }
      Update: Partial<Omit<TransactionRequirement, "id">>
    }
    mtop_application_requirements: {
      Row: ApplicationRequirement
      Insert: Omit<ApplicationRequirement, "id" | "is_verified"> & {
        id?: string
        is_verified?: boolean
      }
      Update: Partial<Omit<ApplicationRequirement, "id">>
    }
    mtop_inspections: {
      Row: MtopInspection
      Insert: Omit<MtopInspection, "id" | "inspection_date" | "created_at"> & {
        id?: string
        inspection_date?: string
        created_at?: string
      }
      Update: Partial<Omit<MtopInspection, "id">>
    }
    mtop_assessments: {
      Row: MtopAssessment
      Insert: Omit<MtopAssessment, "id" | "created_at"> & { id?: string; created_at?: string }
      Update: Partial<Omit<MtopAssessment, "id">>
    }
    mtop_payments: {
      Row: MtopPayment
      Insert: Omit<MtopPayment, "id" | "payment_date" | "payment_method" | "created_at"> & {
        id?: string
        payment_date?: string
        payment_method?: string
        created_at?: string
      }
      Update: Partial<Omit<MtopPayment, "id">>
    }
    approval_logs: {
      Row: ApprovalLog
      Insert: Omit<ApprovalLog, "id" | "created_at"> & { id?: string; created_at?: string }
      Update: Partial<Omit<ApprovalLog, "id">>
    }
    // Append-only: rows come from a trigger, so there is no Insert or Update
    // shape the application is ever allowed to use.
    barangays: {
      Row: Barangay
      Insert: never
      Update: never
    }
    audit_logs: {
      Row: AuditLog
      Insert: never
      Update: never
    }
    mtop_negative_list: {
      Row: MtopNegativeList
      Insert: Omit<MtopNegativeList, "id" | "is_active" | "created_at"> & {
        id?: string
        is_active?: boolean
        created_at?: string
      }
      Update: Partial<Omit<MtopNegativeList, "id">>
    }
    system_settings: {
      Row: SystemSetting
      Insert: Omit<SystemSetting, "updated_at"> & { updated_at?: string }
      Update: Partial<Omit<SystemSetting, "key">>
    }
  }
  Enums: {
    mtop_status: MtopStatus
    requirement_kind: RequirementKind
    grant_effect: GrantEffect
    franchise_status: FranchiseStatus
  }
}
