# Setup local — NOC Loreto (por PC)

Documento para levantar el proyecto en **cualquier PC** (oficina / casa).  
Todo corre **en local**: no depende de Supabase/Render/Vercel para el día a día de monitoreo.

Cursor / otro agente: leer este archivo **antes** de tocar `.env` o asumir una base remota.

---

## Principios

1. **Cada PC tiene su propia base PostgreSQL** (`DB_*` en `backend/.env`).  
   La PC A y la PC B **no** comparten la misma BD salvo que tú copies un dump a propósito.
2. Los archivos **`backend/.env` y `frontend/.env` NO se suben a git**.  
   Solo existen las plantillas `backend/.env.example` y `frontend/.env.example`.
3. Los datos de caídas vienen de **PRTG → `php artisan monitoring:watch` → PostgreSQL local**.  
   **En el navegador el sync NO es automático:** solo cuando pulsas el botón **PRTG** (manual).  
   No hay sync periódico desde Chrome (se desactivó porque congelaba la página).
4. El frontend lee la API local (`/api` o `http://127.0.0.1:8000/api`).

---

## Qué crear en una PC nueva

### 1. Clonar e instalar

```bash
git clone <url-del-repo> sistema_noc_global
cd sistema_noc_global

cd backend
composer install
cp .env.example .env
php artisan key:generate

cd ../frontend
pnpm install   # o npm install
cp .env.example .env
```

### 2. PostgreSQL de ESA PC

En `backend/.env` ajusta **solo esta máquina**:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=monitoreo_llee          # o el nombre que uses aquí
DB_USERNAME=<usuario_local>
DB_PASSWORD=<password_local>        # vacío si tu Postgres local no usa pass
```

Crear la BD si no existe (ejemplo):

```bash
createdb -h 127.0.0.1 -U <usuario_local> monitoreo_llee
```

Migraciones:

```bash
cd backend
php artisan migrate
```

Si traes un dump desde otra PC:

```bash
# ejemplo
psql -h 127.0.0.1 -U <usuario> -d monitoreo_llee < dump.sql
php artisan migrate   # por si faltan migraciones nuevas
```

### 3. Frontend `.env` (local)

Recomendado (proxy Vite → Laravel):

```env
VITE_API_URL=/api
VITE_BACKEND_URL=
```

Alternativa directa:

```env
VITE_API_URL=http://127.0.0.1:8000/api
```

### 4. Backend `.env` URLs locales

```env
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173,localhost:8000,127.0.0.1:8000
```

Si usas LAN (otra IP), cambia `APP_URL`, `FRONTEND_URL` y `SANCTUM_STATEFUL_DOMAINS` a esa IP.  
**No** copies el `.env` de otra PC sin revisar host/DB/IP.

### 5. PRTG (credenciales locales)

En `backend/.env` de esta PC:

```env
PRTG_BASE_URL=...
PRTG_API_TOKEN=...
PRTG_SYNC_ENABLED=false
PRTG_SYNC_INTERVAL_SECONDS=30
```

`PRTG_SYNC_ENABLED=false` es normal: el sync lo hace el **watch**, no el scheduler del request HTTP.

---

## Cómo arrancar (3 procesos)

Terminal 1 — API:

```bash
cd backend
php artisan serve --host=127.0.0.1 --port=8000
```

Terminal 2 — **obligatorio** para que las caídas se actualicen solas:

```bash
cd backend
php artisan monitoring:watch
```

Sin `monitoring:watch`, el dashboard **no** recibe caídas nuevas de PRTG (solo lo que ya esté en BD).

Terminal 3 — UI:

```bash
cd frontend
pnpm dev
```

Abrir: http://localhost:5173

---

## Sync PRTG: watch (auto) vs botón en la UI (manual)

**Regla actual del producto:** en la interfaz web el sync es **solo por botón**. No corre solo en el browser.

| Mecanismo | Qué hace | Estado |
|-----------|----------|--------|
| `monitoring:watch` (terminal) | Lee PRTG cada ≥30s y escribe en la BD local | **Automático en el backend** (obligatorio) |
| Botón **PRTG** en la barra de la UI | Un sync puntual vía API | **Solo manual** — úsalo cuando lo necesites |
| Sync automático desde el navegador | Pedía sync cada X segundos sin que lo pidas | **Desactivado a propósito** (congelaba Chrome) |

Flujo correcto del día a día:

1. Dejas corriendo `php artisan monitoring:watch` → las caídas se actualizan solas en la BD.  
2. El dashboard solo lee la BD (no dispara sync solo).  
3. Si quieres forzar un sync ya, pulsas el botón **PRTG** en la UI.

En la otra PC: no esperes sync automático del browser; arranca el **watch** y usa el botón solo si hace falta.

---

## Flujo operativo (resumen)

1. **Caídas totales** / **Pendientes de gestión** → dar gestión (TIPO 1/2/3).  
2. **En gestión** → seguimiento (timeline, notas, código/causa).  
3. PRTG UP → **Pendiente de cierre** → cerrar ticket (nota + cierre Tracking).  
4. O **Pasar a incidencia** (graves; no se auto-cierran con PRTG UP).  
5. **Caídas masivas** → agrupación por **Nodo/POP** (foto / vista Excel).  
6. **Concentraciones** → por distrito de la rama PRTG (distinto de Nodo/POP).

Tracking General ya no está en el menú: el seguimiento vive en el modal de gestión (pestaña Seguimiento).

---

## Qué NO hacer

- No subir `backend/.env` ni `frontend/.env` al repo.  
- No apuntar `DB_HOST` a Supabase/cloud en el día a día local salvo que lo decidas explícitamente.  
- No asumir que la otra PC tiene la misma BD, usuario o password.  
- No depender del sync del navegador para “tener PRTG al día”: usa el **watch**.

---

## Checklist rápida (otra PC)

- [ ] `composer install` + `pnpm install`  
- [ ] Copiar `.env.example` → `.env` (backend y frontend)  
- [ ] `DB_*` apunta al PostgreSQL **de esa PC**  
- [ ] `php artisan key:generate` (si `.env` nuevo)  
- [ ] `php artisan migrate`  
- [ ] Credenciales PRTG en `.env`  
- [ ] 3 procesos: `serve` + `monitoring:watch` + `pnpm dev`  
- [ ] Login y ver Caídas totales actualizándose con el watch  

---

## Archivos plantilla

- `backend/.env.example` — variables Laravel + PRTG + Sanctum  
- `frontend/.env.example` — `VITE_API_URL`  

Si algo falla en la otra PC, revisar primero este documento y los `.env` locales, no el código de producción en la nube.
