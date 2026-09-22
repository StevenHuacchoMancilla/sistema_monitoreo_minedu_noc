export type ManagedUserRole = 'ADMIN' | 'NOC_OPERATOR' | 'VIEWER'

export type ManagedUser = {
  id: number
  name: string
  email: string
  role: ManagedUserRole | null
  role_label: string | null
  active: boolean
  last_login_at: string | null
  can_write: boolean
  is_admin: boolean
  created_at: string | null
  updated_at: string | null
}

export type UsersListResponse = {
  data: ManagedUser[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
  filters: {
    roles: Array<{ value: ManagedUserRole; label: string }>
  }
}
