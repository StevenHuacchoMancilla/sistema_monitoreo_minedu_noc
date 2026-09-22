<?php

use App\Http\Controllers\Api\V1\Dashboard\CloudnetDashboardController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Dashboard\PrtgDashboardController;
use App\Http\Controllers\Api\V1\Incidents\IncidentController;
use App\Http\Controllers\Api\V1\Monitoring\SyncController;
use App\Http\Controllers\Api\V1\Reports\ReportController;
use App\Http\Controllers\Api\V1\Schools\SchoolController;
use App\Http\Controllers\Api\V1\System\HealthController;
use App\Http\Controllers\Api\V1\System\SyncRunController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
Route::get('/dashboard/prtg', PrtgDashboardController::class);
Route::get('/dashboard/cloudnet', CloudnetDashboardController::class);
Route::get('/dashboard/outages', [DashboardController::class, 'outages']);
Route::get('/dashboard/concentrations', [DashboardController::class, 'concentrations']);
Route::get('/dashboard/school-history', [DashboardController::class, 'schoolHistory']);

Route::get('/schools', [SchoolController::class, 'index']);
Route::post('/schools', [SchoolController::class, 'store']);
Route::get('/schools/{school}', [SchoolController::class, 'show']);
Route::put('/schools/{school}', [SchoolController::class, 'update']);
Route::post('/schools/{school}/deactivate', [SchoolController::class, 'deactivate']);
Route::post('/schools/{school}/reactivate', [SchoolController::class, 'reactivate']);
Route::put('/schools/{school}/assignments/{assignment}', [SchoolController::class, 'updateAssignment']);
Route::post('/schools/{school}/reassign-cid', [SchoolController::class, 'reassignCid']);
Route::post('/schools/{school}/contacts', [SchoolController::class, 'storeContact']);
Route::put('/schools/{school}/contacts/{contact}', [SchoolController::class, 'updateContact']);
Route::post('/schools/{school}/contacts/{contact}/deactivate', [SchoolController::class, 'deactivateContact']);

Route::get('/incidents', [IncidentController::class, 'index']);
Route::get('/incidents/{incident}', [IncidentController::class, 'show']);
Route::put('/incidents/{incident}', [IncidentController::class, 'update']);
Route::post('/incidents/{incident}/managements', [IncidentController::class, 'storeManagement']);
Route::post('/incidents/{incident}/updates', [IncidentController::class, 'addUpdate']);

Route::get('/reports/operational', [ReportController::class, 'operational']);
Route::get('/reports/closing-preview', [ReportController::class, 'closingPreview']);
Route::get('/reports/closing.xlsx', [ReportController::class, 'closingXlsx']);

Route::post('/sync/prtg', [SyncController::class, 'prtg']);
Route::post('/sync/cloudnet', [SyncController::class, 'cloudnet']);

Route::get('/system/sync-runs', [SyncRunController::class, 'runs']);
Route::get('/system/sync-issues', [SyncRunController::class, 'issues']);
