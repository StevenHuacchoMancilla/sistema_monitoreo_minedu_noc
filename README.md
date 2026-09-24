# NOC Loreto — Monitoreo LLEE · MINEDU

Sistema interno de monitoreo NOC (Laravel + React). Uso **exclusivo en LAN**; no exponer a Internet.

## Uso en red local

Servidor LAN actual (PC con el stack):

- IPv4: `192.168.101.34`
- Red: `192.168.101.32/27`

| Servicio | URL |
|----------|-----|
| Frontend (React/Vite) | http://192.168.101.34:5173 |
| Backend (Laravel) | http://192.168.101.34:8000 |
| API health | http://192.168.101.34:8000/api/health |

PostgreSQL permanece en `127.0.0.1:5432` (solo Laravel en esta PC). **No** abrir el puerto 5432 a la LAN.

### Pasos en el PC servidor

1. PostgreSQL activo.
2. Backend:
   ```bash
   cd backend
   php artisan optimize:clear
   php artisan serve --host=0.0.0.0 --port=8000
   ```
3. Frontend:
   ```bash
   cd frontend
   pnpm dev
   ```
   (o `pnpm dev:lan` — Vite ya escucha en `0.0.0.0:5173`).
4. Usuarios en la misma red abren: http://192.168.101.34:5173

### Firewall (Windows, PC servidor)

Permitir entradas en la red privada:

- TCP **5173** (Vite)
- TCP **8000** (Laravel)

No abrir TCP **5432**. No desactivar el firewall completo.

Ejemplo PowerShell (Administrador):

```powershell
New-NetFirewallRule -DisplayName "NOC Loreto Vite 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "NOC Loreto Laravel 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```

### Arquitectura

```
PC usuario (LAN)
  → http://192.168.101.34:5173  (React)
  → /api y /sanctum (mismo origen; proxy Vite → Laravel en 127.0.0.1:8000)
  → Laravel → 127.0.0.1:5432 (PostgreSQL)
```

El frontend usa `VITE_API_URL=/api` (relativo). Los clientes **no** deben llamar `localhost:8000`.

### Notas

- Si DHCP cambia la IP del servidor, actualizar `.env` (`APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`) y documentar la nueva IP. Ideal: reserva DHCP fija.
- Dictado por voz puede fallar en `http://IP` (secure context); el textarea manual sigue disponible.
- No port-forward / UPnP / exposición a Internet.
