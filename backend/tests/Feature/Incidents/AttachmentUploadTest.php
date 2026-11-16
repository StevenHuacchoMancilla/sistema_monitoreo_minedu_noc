<?php

namespace Tests\Feature\Incidents;

use App\Enums\CidStatus;
use App\Enums\FollowupStatus;
use App\Enums\MonitoringStatus;
use App\Models\Incident;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AttachmentUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_operator_can_upload_image_attachment(): void
    {
        Storage::fake('public');

        $user = User::factory()->create([
            'role' => 'ADMIN',
            'active' => true,
        ]);

        $school = School::query()->create([
            'codigo_local' => '399001',
            'local_educativo' => 'COLEGIO EVIDENCIA',
            'active' => true,
        ]);
        $assignment = NetworkAssignment::query()->create([
            'school_id' => $school->id,
            'cid' => '258618',
            'cid_status' => CidStatus::Valid,
            'monitoring_eligible' => true,
            'is_active' => true,
        ]);
        $incident = Incident::query()->create([
            'school_id' => $school->id,
            'network_assignment_id' => $assignment->id,
            'detection_source' => 'REALTIME_SYNC',
            'started_at' => now()->subHour(),
            'current_status' => MonitoringStatus::Operativo->value,
            'followup_status' => FollowupStatus::EnGestion,
        ]);

        $file = UploadedFile::fake()->image('evidencia.jpg', 200, 200);

        $response = $this->actingAs($user)
            ->post('/api/incidents/'.$incident->id.'/attachments', [
                'file' => $file,
            ], [
                'Accept' => 'application/json',
            ]);

        $response->assertCreated();
        $response->assertJsonPath('data.original_name', 'evidencia.jpg');
        $url = (string) $response->json('data.url');
        $this->assertStringStartsWith('/storage/', $url);
        Storage::disk('public')->assertExists(ltrim(substr($url, strlen('/storage/')), '/'));
    }
}
