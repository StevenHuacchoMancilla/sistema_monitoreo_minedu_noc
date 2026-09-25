<?php

use App\Domain\Auth\PermissionCatalog;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Dashboard\CloudnetDashboardController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Dashboard\PrtgDashboardController;
use App\Http\Controllers\Api\V1\History\SchoolHistoryController;
use App\Http\Controllers\Api\V1\Incidents\IncidentController;
use App\Http\Controllers\Api\V1\Incidents\RecoveredIncidentController;
use App\Http\Controllers\Api\V1\Monitoring\PrtgLocationController;
use App\Http\Controllers\Api\V1\Monitoring\SyncController;
use App\Http\Controllers\Api\V1\Notifications\OperationalNotificationController;
use App\Http\Controllers\Api\V1\Profile\ProfileController;
use App\Http\Controllers\Api\V1\Reports\ReportController;
use App\Http\Controllers\Api\V1\Schools\SchoolController;
use App\Http\Controllers\Api\V1\System\HealthController;
use App\Http\Controllers\Api\V1\System\SyncRunController;
use App\Http\Controllers\Api\V1\Tracking\TrackingController;
use App\Http\Controllers\Api\V1\Users\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'updatePassword']);

    Route::middleware('permission:'.PermissionCatalog::DASHBOARD_PRTG_VIEW)->group(function () {
        Route::get('/dashboard/prtg', PrtgDashboardController::class);
    });

    Route::middleware('permission:'.PermissionCatalog::DASHBOARD_CLOUDNET_VIEW)->group(function () {
        Route::get('/dashboard/cloudnet', CloudnetDashboardController::class);
    });

    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('/dashboard/outages', [DashboardController::class, 'outages']);
    Route::get('/dashboard/concentrations', [DashboardController::class, 'concentrations']);
    Route::get('/dashboard/school-history', [DashboardController::class, 'schoolHistory']);

    Route::get('/prtg/locations/provinces', [PrtgLocationController::class, 'provinces']);
    Route::get('/prtg/locations/districts', [PrtgLocationController::class, 'districts']);
    Route::get('/prtg/locations/tree', [PrtgLocationController::class, 'tree']);

    Route::middleware('permission:'.PermissionCatalog::HISTORY_VIEW)->group(function () {
        Route::get('/history/schools', [SchoolHistoryController::class, 'index']);
        Route::get('/history/schools/{school}', [SchoolHistoryController::class, 'show']);
        Route::get('/history/schools/{school}/incidents', [SchoolHistoryController::class, 'incidents']);
        Route::get('/history/incidents/{incident}', [SchoolHistoryController::class, 'incidentCaseFile']);
    });

    Route::middleware('permission:'.PermissionCatalog::SCHOOLS_VIEW)->group(function () {
        Route::get('/schools', [SchoolController::class, 'index']);
        Route::get('/schools/{school}', [SchoolController::class, 'show']);
    });

    Route::middleware('permission:'.PermissionCatalog::INCIDENTS_VIEW)->group(function () {
        Route::get('/incidents', [IncidentController::class, 'index']);
        Route::get('/incidents/recovered/summary', [RecoveredIncidentController::class, 'summary']);
        Route::get('/incidents/recovered', [RecoveredIncidentController::class, 'index']);
        Route::get('/notifications/operational', [OperationalNotificationController::class, 'index']);
        Route::get('/incidents/{incident}', [IncidentController::class, 'show']);
    });

    Route::middleware('permission:'.PermissionCatalog::REPORTS_VIEW)->group(function () {
        Route::get('/reports/operational', [ReportController::class, 'operational']);
        Route::get('/reports/closing-preview', [ReportController::class, 'closingPreview']);
    });

    Route::middleware('permission:'.PermissionCatalog::REPORTS_EXPORT)->group(function () {
        Route::get('/reports/closing.xlsx', [ReportController::class, 'closingXlsx']);
    });

    Route::middleware('permission:'.PermissionCatalog::TRACKING_VIEW)->group(function () {
        Route::get('/tracking/summary', [TrackingController::class, 'summary']);
        Route::get('/tracking/actors', [TrackingController::class, 'actors']);
        Route::get('/tracking/report.xlsx', [TrackingController::class, 'reportXlsx']);
        Route::get('/tracking/report', [TrackingController::class, 'report']);
        Route::get('/tracking', [TrackingController::class, 'index']);
        Route::get('/tracking/{tracking}', [TrackingController::class, 'show']);
    });

    Route::middleware('permission:'.PermissionCatalog::ADMIN_VIEW)->group(function () {
        Route::get('/system/sync-runs', [SyncRunController::class, 'runs']);
        Route::get('/system/sync-issues', [SyncRunController::class, 'issues']);
    });

    // Escritura operativa: ADMIN + NOC_OPERATOR (vía permisos)
    Route::middleware('permission:'.PermissionCatalog::TRACKING_MANAGE)->group(function () {
        Route::post('/tracking', [TrackingController::class, 'store']);
        Route::post('/tracking/{tracking}/updates', [TrackingController::class, 'storeUpdate']);
        Route::put('/tracking/{tracking}/codigo-causa', [TrackingController::class, 'updateCodigoCausa']);
        Route::post('/tracking/{tracking}/acknowledge-recovery', [TrackingController::class, 'acknowledgeRecovery']);
    });

    Route::middleware('permission:'.PermissionCatalog::TRACKING_CLOSE)->group(function () {
        Route::post('/tracking/{tracking}/close', [TrackingController::class, 'close']);
    });

    Route::middleware('permission:'.PermissionCatalog::TRACKING_REOPEN)->group(function () {
        Route::post('/tracking/{tracking}/reopen', [TrackingController::class, 'reopen']);
    });

    Route::middleware('permission:'.PermissionCatalog::SCHOOLS_MANAGE)->group(function () {
        Route::post('/schools', [SchoolController::class, 'store']);
        Route::put('/schools/{school}', [SchoolController::class, 'update']);
        Route::post('/schools/{school}/deactivate', [SchoolController::class, 'deactivate']);
        Route::post('/schools/{school}/reactivate', [SchoolController::class, 'reactivate']);
        Route::put('/schools/{school}/assignments/{assignment}', [SchoolController::class, 'updateAssignment']);
        Route::post('/schools/{school}/reassign-cid', [SchoolController::class, 'reassignCid']);
        Route::post('/schools/{school}/contacts', [SchoolController::class, 'storeContact']);
        Route::put('/schools/{school}/contacts/{contact}', [SchoolController::class, 'updateContact']);
        Route::post('/schools/{school}/contacts/{contact}/deactivate', [SchoolController::class, 'deactivateContact']);
    });

    Route::middleware('permission:'.PermissionCatalog::INCIDENTS_MANAGE)->group(function () {
        Route::put('/incidents/{incident}', [IncidentController::class, 'update']);
        Route::post('/incidents/{incident}/managements', [IncidentController::class, 'storeManagement']);
        Route::post('/incidents/{incident}/updates', [IncidentController::class, 'addUpdate']);
        Route::post('/incidents/{incident}/field-dispatches', [IncidentController::class, 'fieldDispatch']);
    });

    Route::middleware('permission:'.PermissionCatalog::RECOVERIES_MANAGE)->group(function () {
        Route::post('/incidents/{incident}/recovery-review', [IncidentController::class, 'recoveryReview']);
    });

    Route::middleware('permission:'.PermissionCatalog::SYNC_RUN)->group(function () {
        Route::post('/sync/prtg', [SyncController::class, 'prtg']);
        Route::post('/sync/cloudnet', [SyncController::class, 'cloudnet']);
    });

    // Solo ADMIN
    Route::middleware('permission:'.PermissionCatalog::USERS_MANAGE)->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::post('/users/{user}/deactivate', [UserController::class, 'deactivate']);
        Route::post('/users/{user}/reactivate', [UserController::class, 'reactivate']);
        Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
    });
});
