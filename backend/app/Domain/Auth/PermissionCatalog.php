<?php

namespace App\Domain\Auth;

use App\Enums\UserRole;

/**
 * Matriz canónica de permisos por rol.
 * El frontend usa la lista de /api/me; Laravel es la autoridad.
 */
final class PermissionCatalog
{
    public const DASHBOARD_PRTG_VIEW = 'dashboard.prtg.view';

    public const DASHBOARD_CLOUDNET_VIEW = 'dashboard.cloudnet.view';

    public const INCIDENTS_VIEW = 'incidents.view';

    public const INCIDENTS_MANAGE = 'incidents.manage';

    public const RECOVERIES_VIEW = 'recoveries.view';

    public const RECOVERIES_MANAGE = 'recoveries.manage';

    public const HISTORY_VIEW = 'history.view';

    public const TRACKING_VIEW = 'tracking.view';

    public const TRACKING_MANAGE = 'tracking.manage';

    public const TRACKING_CLOSE = 'tracking.close';

    public const TRACKING_REOPEN = 'tracking.reopen';

    public const SCHOOLS_VIEW = 'schools.view';

    public const SCHOOLS_MANAGE = 'schools.manage';

    public const REPORTS_VIEW = 'reports.view';

    public const REPORTS_EXPORT = 'reports.export';

    public const USERS_MANAGE = 'users.manage';

    public const ADMIN_VIEW = 'admin.view';

    public const SYNC_RUN = 'sync.run';

    public const PROFILE_MANAGE_OWN = 'profile.manage_own';

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return [
            self::DASHBOARD_PRTG_VIEW,
            self::DASHBOARD_CLOUDNET_VIEW,
            self::INCIDENTS_VIEW,
            self::INCIDENTS_MANAGE,
            self::RECOVERIES_VIEW,
            self::RECOVERIES_MANAGE,
            self::HISTORY_VIEW,
            self::TRACKING_VIEW,
            self::TRACKING_MANAGE,
            self::TRACKING_CLOSE,
            self::TRACKING_REOPEN,
            self::SCHOOLS_VIEW,
            self::SCHOOLS_MANAGE,
            self::REPORTS_VIEW,
            self::REPORTS_EXPORT,
            self::USERS_MANAGE,
            self::ADMIN_VIEW,
            self::SYNC_RUN,
            self::PROFILE_MANAGE_OWN,
        ];
    }

    /**
     * @return list<string>
     */
    public static function forRole(UserRole $role): array
    {
        return match ($role) {
            UserRole::Admin => self::all(),
            UserRole::NocOperator => [
                self::INCIDENTS_VIEW,
                self::INCIDENTS_MANAGE,
                self::RECOVERIES_VIEW,
                self::RECOVERIES_MANAGE,
                self::HISTORY_VIEW,
                self::TRACKING_VIEW,
                self::TRACKING_MANAGE,
                self::TRACKING_CLOSE,
                self::TRACKING_REOPEN,
                self::SCHOOLS_VIEW,
                self::SCHOOLS_MANAGE,
                self::REPORTS_VIEW,
                self::REPORTS_EXPORT,
                self::SYNC_RUN,
                self::PROFILE_MANAGE_OWN,
            ],
            UserRole::Viewer => [
                self::DASHBOARD_PRTG_VIEW,
                self::DASHBOARD_CLOUDNET_VIEW,
                self::INCIDENTS_VIEW,
                self::RECOVERIES_VIEW,
                self::HISTORY_VIEW,
                self::TRACKING_VIEW,
                self::SCHOOLS_VIEW,
                self::REPORTS_VIEW,
                self::REPORTS_EXPORT,
                self::PROFILE_MANAGE_OWN,
            ],
        };
    }

    public static function roleHas(UserRole $role, string $permission): bool
    {
        return in_array($permission, self::forRole($role), true);
    }
}
