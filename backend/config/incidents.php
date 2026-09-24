<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Reloj operativo de caídas / recuperaciones
    |--------------------------------------------------------------------------
    |
    | false (recomendado, igual Apps Script LLEE):
    |   started_at  = lastcheck − downtimesince_raw (inicio real PRTG)
    |   recovered_at = lastcheck − uptimesince_raw
    |   Así, si el sync arranca a las 09:00 tras la madrugada, la caída
    |   queda en la hora real (ej. 22:43), no en la hora de detección.
    |
    | true: hora del servidor al detectar (pierde caídas nocturnas si el
    |   sync estuvo apagado).
    |
    */
    'use_system_clock' => (bool) env('INCIDENT_USE_SYSTEM_CLOCK', false),

    /*
    | Si el Ping vuelve a CAÍDO antes de N segundos tras recovered_at,
    | se reabre la misma incidencia (no se crea otra). Agrupa flaps inestables.
    */
    'flap_reopen_seconds' => (int) env('INCIDENT_FLAP_REOPEN_SECONDS', 900),

    /*
    | Ventana para fusionar historial ya guardado (más amplia que realtime).
    | Gap recuperación→re-caída ≤ N segundos ⇒ misma incidencia operativa.
    */
    'history_coalesce_seconds' => (int) env('INCIDENT_HISTORY_COALESCE_SECONDS', 1800),

    /*
    | Reconciliación histórica PRTG: por defecto NO crea incidencias retrospectivas
    | (evita cientos de micro-outages). Solo corrige tiempos de las existentes si se aplica.
    */
    'reconciliation_allow_creates' => (bool) env('PRTG_RECONCILE_ALLOW_CREATES', false),

];
