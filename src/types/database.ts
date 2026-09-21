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

export type MtopDocumentType =
  | "application_form"
  | "ctms_clearance"
  | "lto_or"
  | "voters_certificate"
  | "barangay_certification"
  | "barangay_endorsement"
  | "ctc"
  | "police_clearance"
  | "drivers_license"
  | "affidavit_no_franchise"

export type ApprovalAction =
  | "approved"
  | "rejected"
  | "returned"
  | "forwarded"
  | "reopened"
  | "resubmitted"

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
  applicant_name: string
  applicant_address: string | null
  contact_number: string | null
  tricycle_body_number: string | null
  plate_number: string | null
  motor_number: string
  chassis_number: string
  route: string | null
  make: string | null
  day_off: string | null
  granted_until: string | null
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
  status: MtopStatus
  fiscal_year: number
  due_date: string | null
  submitted_at: string
  granted_at: string | null
  division_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  returned_from: Extract<MtopStatus, "for_verification" | "for_inspection"> | null
}

export interface MtopDocument {
  id: string
  application_id: string
  document_type: MtopDocumentType
  file_url: string | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
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
  returned_from: Extract<MtopStatus, "for_verification" | "for_inspection"> | null
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
  documents?: MtopDocument[]
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
      }
      Update: Partial<Omit<MtopFranchise, "id">>
    }
    mtop_applications: {
      Row: MtopApplication
      Insert: Omit<MtopApplication, "id" | "status" | "fiscal_year" | "submitted_at" | "created_at" | "updated_at" | "returned_from"> & {
        id?: string
        status?: MtopStatus
        fiscal_year?: number
        submitted_at?: string
        created_at?: string
        updated_at?: string
        returned_from?: MtopApplication["returned_from"]
      }
      Update: Partial<Omit<MtopApplication, "id">>
    }
    mtop_documents: {
      Row: MtopDocument
      Insert: Omit<MtopDocument, "id" | "is_verified"> & { id?: string; is_verified?: boolean }
      Update: Partial<Omit<MtopDocument, "id">>
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
    mtop_document_type: MtopDocumentType
  }
}
