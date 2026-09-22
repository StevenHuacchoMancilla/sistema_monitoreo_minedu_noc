export type SchoolListRow = {
  id: number
  n: number | null
  cid: string | null
  codigo_local: string | null
  codigo_modular: string | null
  local_educativo: string | null
  provincia: string | null
  distrito: string | null
  tecnologia: string | null
  capacidad_mbps: string | number | null
  nodo_pop: string | null
  active: boolean
  prtg_device_name: string | null
}

export type SchoolListResponse = {
  data: SchoolListRow[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
  filters?: {
    provincias: string[]
    distritos: string[]
    tecnologias: string[]
  }
  stats?: {
    total: number
    active: number
    with_cid: number
    without_cid: number
  }
}

export type SchoolGeneralPayload = {
  current_sequence?: number | null
  legacy_reference?: string | null
  codigo_local?: string
  codigo_modular?: string | null
  local_educativo?: string
  departamento?: string | null
  provincia?: string | null
  distrito?: string | null
  centro_poblado?: string | null
  clasificacion?: string | null
  nivel_iiee?: string | null
  latitud?: string | null
  longitud?: string | null
  active?: boolean
  cid?: string | null
  prtg_device_name?: string | null
  capacidad_mbps?: string | null
  tecnologia_acceso?: string | null
  nodo_pop?: string | null
  ip_publica?: string | null
  ip_loopback?: string | null
  ip_wan_principal?: string | null
  ip_lan?: string | null
  gateway_wan?: string | null
  vlan_internet?: string | null
  vlan_uplink?: string | null
}

export type NetworkAssignmentPayload = {
  cid?: string | null
  prtg_device_name?: string | null
  capacidad_mbps?: string | null
  tecnologia_acceso?: string | null
  nodo_pop?: string | null
  ip_publica?: string | null
  ip_loopback?: string | null
  ip_wan_principal?: string | null
  netmask_wan_principal?: string | null
  ip_lan?: string | null
  gateway_wan?: string | null
  vlan_internet?: string | null
  vlan_uplink?: string | null
  vlan_mgmt_ap?: string | null
  ip_mgmt_ap?: string | null
  observaciones?: string | null
}

export type ContactPayload = {
  position: number
  name?: string | null
  role?: string | null
  phone?: string | null
  validation_status?: string | null
}
