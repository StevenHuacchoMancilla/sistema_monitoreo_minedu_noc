export type SyncSnapshot = {
  run_id?: number
  status: string | null
  last_sync: string | null
  finished_at?: string | null
  processed: number
  processed_count?: number
  warnings: number
  warning_count?: number
  errors: number
  error_count?: number
} | null

export type ChartSlice = {
  key: string
  label: string
  value: number
  color: string
}

export type FleetPoint = {
  at: string
  label: string
  availability_pct: number | null
  alarms: number
  operational: number
  transitions_down: number
  transitions_up: number
  samples: number
}

export type PrtgChartsPayload = {
  ping_status: ChartSlice[]
  sensor_mix: ChartSlice[]
  availability_trend: Array<{
    at: string | null
    label: string
    operational: number
    down: number
    availability_pct: number
  }>
  fleet_2d?: FleetPoint[]
  fleet_30d?: FleetPoint[]
  transitions_24h: Array<{
    hour: string
    to_down: number
    to_up: number
    total: number
  }>
  by_province: Array<{
    province: string
    operational: number
    down: number
    partial: number
    paused: number
    total: number
  }>
  concentrations: Array<{
    label: string
    caidos: number
    pct: number
  }>
  snapshot?: {
    availability_pct: number
    alarms: number
    operational: number
    down: number
    monitored: number
  }
}

export type SyncDiagnostics = {
  run_id: number | null
  total_warnings: number
  total_errors: number
  by_code: Array<{
    code: string
    severity: string
    total: number
    label: string
  }>
  samples: Array<{
    code: string
    severity: string
    message: string
    cid: string | null
    payload?: Record<string, unknown> | null
  }>
  summary: string
}

export type PrtgDashboard = {
  health: {
    api: boolean
    database: boolean
    prtg: boolean
    driver?: string
    name?: string | null
  }
  sync: SyncSnapshot
  sync_diagnostics?: SyncDiagnostics
  charts?: PrtgChartsPayload
  kpis: {
    total_schools: number
    valid_cid: number
    monitored: number
    operational: number
    down: number
    partial: number
    paused: number
    without_prtg: number
    active_incidents: number
    pending_contact: number
    in_management: number
    recovered_today: number
    concentrations: number
    prtg_devices?: number
    prtg_sensors_total?: number
    prtg_sensors_ping?: number
    prtg_sensors_lan?: number
  }
  status_distribution: {
    operational: number
    down: number
    partial: number
    paused: number
    without_monitoring: number
    operational_pct: number
  }
  coverage: {
    valid_cid: number
    associated: number
    unassociated: number
    duplicate_cids: number
    duplicate_ping_sensors: number
    sync_warnings: number
  }
  monitoring: {
    associated_devices: number
    unassociated_devices: number
    ping_sensors: number
    lan_sensors?: number
    sensors_total?: number
    problem_sensors: number
    source_scope?: string
  }
  inventory?: {
    devices: number
    sensors_total: number
    sensors_ping: number
    sensors_lan: number
    sensors_other: number
    source_scope: string
  }
  nav: {
    caidas_activas: number
    pendientes_contacto: number
    en_gestion: number
    concentraciones: number
    recuperados: number
    pending_reviews?: number
  }
  links: Record<string, string>
}

export type CloudnetDashboard = {
  health: {
    api: boolean
    database: boolean
    cloudnet: boolean
    driver?: string
    name?: string | null
  }
  sync: SyncSnapshot
  kpis: {
    sites: number
    linked_sites: number
    unlinked_sites: number
    devices_total: number
    devices_online: number
    devices_offline: number
    aps_total: number
    aps_online: number
    aps_offline: number
    online_clients: number
    sites_without_device: number
    sites_without_ap: number
  }
  coverage: {
    total_schools: number
    sites: number
    linked_sites: number
    unlinked_sites: number
    schools_without_site: number
    sites_with_cid: number
    sites_with_codigo_local: number
  }
  device_status: {
    online: number
    offline: number
    unknown: number
    total: number
    availability_pct: number | null
  }
  ap_status: {
    online: number
    offline: number
    unknown: number
    total: number
    sites_without_ap: number
  }
  clients: {
    online: number
    sites_with_clients: number
    sites_without_clients: number
    avg_per_site: number
    top_sites: Array<{
      shop_id?: string | number | null
      site_name?: string | null
      cid_detected?: string | null
      clients: number
    }>
    data_available: boolean
  }
  correlation: {
    prtg_down_cloudnet_offline: number
    prtg_down_cloudnet_online: number
    prtg_operational_cloudnet_offline: number
    note: string
  }
  inventory?: {
    total_sites_with_cid: number
    sites_with_devices: number
    sites_with_aps: number
    offline_devices: number
    note: string
    rows: Array<{
      cid: string | null
      codigo_local: string | null
      shop_id: string | number | null
      site_name: string | null
      address: string | null
      school: string | null
      provincia: string | null
      distrito: string | null
      match_status: string | null
      devices_total: number
      aps_total: number
      clients: number
      devices: Array<{
        serial: string | null
        model: string | null
        status: string | null
        ip: string | null
        mac: string | null
      }>
      aps: Array<{
        serial: string | null
        model: string | null
        status: string | null
        ip: string | null
        mac: string | null
        clients: number
      }>
    }>
  }
  charts?: {
    devices: ChartSlice[]
    aps: ChartSlice[]
    clients_total: number
  }
  links: Record<string, string>
}
