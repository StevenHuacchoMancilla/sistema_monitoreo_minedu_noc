# Handoff para Cursor (otra máquina)

Léelo primero si te piden «analiza el proyecto» o continuar el trabajo de NOC Loreto.
Fecha de este handoff: 2026-11-09 (sesión Steven / máquina principal).

## Qué se hizo en esta entrega (resumen)

Trabajo operativo NOC Loreto alrededor de **tickets TGS**, **mantenimientos**, **lista LLEE por día** y **reportes**.

### 1. Lista para reporte (antes «Vista de reporte»)
- Lista de LLEE **por día** (hoy editable; días anteriores historial).
- ESTADO de lista **manual** (9 tarjetas de leyenda; sin auto LE05→Energía).
- DETALLE = comentarios del operador con hora; en la tabla va preview; panel **Ver / editar detalle**.
- Excel omite Activo/Restablecido.
- Backend: `lista_llee_days` + `ListaLleeDayService`, APIs de estado/detalle de lista.

### 2. Seguimiento de caídas (antes «Reporte general»)
- Filtros: Abiertos = solo ticket TGS **ABIERTO**; MINEDU multi-select; fechas Hoy/Ayer/día/rango.
- Columnas Detalle vs **Detalle de evento** en paneles laterales.
- Detalle de evento usa formato de visita/mantenimiento (`ServiceTicketService::eventText`).

### 3. Mantenimientos y tickets
- Tipo de ticket: **Correctivo** | **Preventivo** | **Asignación libre**.
  - Correctivo → marca incidencia (Incidencias).
  - Preventivo → `is_maintenance` → menú **Mantenimientos**.
  - Asignación libre → sin forzar correctivo/preventivo.
- MINEDU Queja / Caída de enlace → Incidencias (como antes).
- Campos de **detalle de evento**: hora inicio, técnico, celular, actividades, materiales, restablecimiento (si no preventivo), hora salida.
- El **Detalle** de seguimiento NO se llena en el modal «Generar ticket»; se llena en la gestión normal del caso.
- Menú: solo **Mantenimientos** (pestañas Abiertos / Finalizados). Quitado «Mantenimientos finalizados» del sidebar.
- Imagen PNG del ticket: sin cuadro «Cierre operativo» (no mostrar NOC); mensaje verde **Servicio operativo**; nombre de archivo = código TGS.
- Generar / completar ticket desde **Incidencias** y **En gestión**; descargar imagen también desde **Historial por colegio**.

### 4. Navegación y permisos
- Reportes (orden): **Lista para reporte**, **Seguimiento de caídas**, Histórico, Anexo 30, Uso de internet.
- Solo **admin** (`admin.view`): Misma hora, Caídas masivas, Concentraciones (menú + rutas).

### 5. Otros
- Timeline/historial más limpio (menos ruido de sistema).
- Campos de implementación en schools + importadores/comandos varios.
- Migración `service_tickets`: `is_maintenance`, `technician_phone`.

## Archivos clave

| Área | Rutas importantes |
|------|-------------------|
| Lista LLEE día | `backend/.../ListaLleeDayService.php`, migraciones `2026_11_08_22*`, `OperationalReportPage.tsx` |
| Seguimiento caídas | `GeneralReportService.php`, `GeneralReportPage.tsx` |
| Tickets / mant. | `ServiceTicketService.php`, `ServiceTicket.php`, `MaintenancePage.tsx`, `GenerateTicketModal.tsx`, `MaintenanceTicketImageTemplate.tsx` |
| API | `IncidentController` (`ensure-ticket`, `maintenance`, visit), `routes/api.php` |
| Menú | `frontend/src/layouts/Sidebar.tsx`, `frontend/src/app/router.tsx` |

## Cómo probar rápido

1. Migraciones: `php artisan migrate` (incluye mantenimientos + lista días).
2. Registrar ticket con Preventivo → aparece en Mantenimientos.
3. Correctivo → Incidencias; desde ahí Generar ticket / Imagen.
4. En gestión → Generar ticket / descargar imagen.
5. Lista para reporte: editar detalle hoy; ver día anterior solo lectura.
6. Seguimiento de caídas: filtro Abiertos y paneles Detalle / Detalle de evento.
7. Login no-admin: no debe ver Misma hora / Caídas masivas / Concentraciones.

## Commits de esta subida

Varios commits temáticos en español (no un solo commit monolítico). Revisa `git log` reciente.

## Nota para el agente

No inventes de nuevo el flujo de mantenimientos: ya está cableado. Si piden causa raíz como filtro en Seguimiento de caídas, quedó **pospuesto** (irá a un dashboard). Prioriza bugs de datos (nombre colegio numérico, sync school_name) y UX.
