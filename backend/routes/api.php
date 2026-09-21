<?php

use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Incidents\IncidentController;
use App\Http\Controllers\Api\V1\Monitoring\SyncController;
use App\Http\Controllers\Api\V1\Schools\SchoolController;
use App\Http\Controllers\Api\V1\System\HealthController;
use App\Http\Controllers\Api\V1\System\SyncRunController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
Route::get('/dashboard/outages', [DashboardController::class, 'outages']);
Route::get('/dashboard/concentrations', [DashboardController::class, 'concentrations']);
Route::get('/dashboard/school-history', [DashboardController::class, 'schoolHistory']);

Route::get('/schools', [SchoolController::class, 'index']);
Route::get('/schools/{school}', [SchoolController::class, 'show']);

Route::get('/incidents', [IncidentController::class, 'index']);
Route::get('/incidents/{incident}', [IncidentController::class, 'show']);
Route::put('/incidents/{incident}', [IncidentController::class, 'update']);
Route::post('/incidents/{incident}/updates', [IncidentController::class, 'addUpdate']);

Route::post('/sync/prtg', [SyncController::class, 'prtg']);
Route::post('/sync/cloudnet', [SyncController::class, 'cloudnet']);

Route::get('/system/sync-runs', [SyncRunController::class, 'runs']);
Route::get('/system/sync-issues', [SyncRunController::class, 'issues']);
