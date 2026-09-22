<?php

namespace App\Domain\Tracking\Services;

use App\Enums\CidStatus;
use App\Models\NetworkAssignment;
use App\Models\School;
use App\Support\Normalization\IdentifierNormalizer;

class TrackingSchoolResolver
{
    /**
     * @return array{
     *   ok: bool,
     *   school: ?School,
     *   assignment: ?NetworkAssignment,
     *   code: ?string,
     *   message: ?string,
     *   payload: array<string, mixed>
     * }
     */
    public function resolve(?string $cidRaw, ?string $tssRaw): array
    {
        $cid = IdentifierNormalizer::identifier($cidRaw);
        $tss = IdentifierNormalizer::identifier($tssRaw);
        $tssInt = $tss !== null && preg_match('/^\d+$/', $tss) === 1 ? (int) $tss : null;

        $assignment = $cid !== null ? $this->findAssignmentByCid($cid) : null;
        $schoolByCid = $assignment?->school;
        $schoolByTss = $tssInt !== null
            ? School::query()->where('current_sequence', $tssInt)->orderByDesc('id')->first()
            : null;

        if ($schoolByCid && $schoolByTss && $schoolByCid->id !== $schoolByTss->id) {
            return [
                'ok' => false,
                'school' => null,
                'assignment' => null,
                'code' => 'TRACKING_SCHOOL_MISMATCH',
                'message' => 'CID y TSS identifican colegios diferentes; requiere revisión.',
                'payload' => [
                    'cid' => $cid,
                    'tss' => $tss,
                    'school_id_by_cid' => $schoolByCid->id,
                    'school_id_by_tss' => $schoolByTss->id,
                    'school_name_by_cid' => $schoolByCid->local_educativo,
                    'school_name_by_tss' => $schoolByTss->local_educativo,
                ],
            ];
        }

        if ($schoolByCid) {
            return [
                'ok' => true,
                'school' => $schoolByCid,
                'assignment' => $assignment,
                'code' => null,
                'message' => null,
                'payload' => [
                    'matched_by' => 'cid',
                    'tss_checked' => $schoolByTss !== null,
                ],
            ];
        }

        if ($schoolByTss) {
            $active = $schoolByTss->activeAssignment;

            return [
                'ok' => true,
                'school' => $schoolByTss,
                'assignment' => $active,
                'code' => $cid !== null ? 'TRACKING_CID_NOT_FOUND' : null,
                'message' => $cid !== null
                    ? 'Colegio resuelto por TSS; CID no encontrado en asignaciones.'
                    : null,
                'payload' => [
                    'matched_by' => 'tss',
                    'cid' => $cid,
                    'tss' => $tss,
                ],
            ];
        }

        return [
            'ok' => false,
            'school' => null,
            'assignment' => null,
            'code' => 'TRACKING_SCHOOL_NOT_FOUND',
            'message' => 'No se encontró colegio por CID ni por TSS.',
            'payload' => [
                'cid' => $cid,
                'tss' => $tss,
            ],
        ];
    }

    private function findAssignmentByCid(string $cid): ?NetworkAssignment
    {
        $activeValid = NetworkAssignment::query()
            ->with('school')
            ->where('cid', $cid)
            ->where('is_active', true)
            ->where('cid_status', CidStatus::Valid)
            ->orderByDesc('id')
            ->first();

        if ($activeValid) {
            return $activeValid;
        }

        return NetworkAssignment::query()
            ->with('school')
            ->where('cid', $cid)
            ->orderByDesc('is_active')
            ->orderByDesc('id')
            ->first();
    }
}
