<?php

namespace App\Services\Import;

use App\Enums\ContactMatchStatus;
use App\Support\Normalization\IdentifierNormalizer;

class SchoolIdentityMatcher
{
    /**
     * @param  array<int, array<string, mixed>>  $candidates
     * @return array{status: ContactMatchStatus, priority: int|null, matches: array<int, array<string, mixed>>}
     */
    public function match(array $school, array $candidates): array
    {
        $local = (string) ($school['codigo_local'] ?? '');
        $modular = (string) ($school['codigo_modular'] ?? '');
        $name = $school['_name_n'] ?? IdentifierNormalizer::normalizeName($school['local_educativo'] ?? null);
        $district = $school['_dist_n'] ?? IdentifierNormalizer::normalizeName($school['distrito'] ?? null);

        $scoped = array_values(array_filter(
            $candidates,
            fn (array $candidate): bool => (string) ($candidate['codigo_local'] ?? '') === $local && $local !== ''
        ));
        if ($scoped === []) {
            return ['status' => ContactMatchStatus::Pending, 'priority' => null, 'matches' => []];
        }

        $priority1 = array_values(array_filter($scoped, function (array $candidate) use ($local, $modular, $name, $district): bool {
            return (string) ($candidate['codigo_local'] ?? '') === $local
                && (string) ($candidate['codigo_modular'] ?? '') === $modular
                && ($candidate['_name_n'] ?? IdentifierNormalizer::normalizeName($candidate['local_educativo'] ?? null)) === $name
                && ($candidate['_dist_n'] ?? IdentifierNormalizer::normalizeName($candidate['distrito'] ?? null)) === $district
                && $local !== '' && $modular !== '' && $name !== '' && $district !== '';
        }));

        if (count($priority1) === 1) {
            return ['status' => ContactMatchStatus::Matched, 'priority' => 1, 'matches' => $priority1];
        }
        if (count($priority1) > 1) {
            return ['status' => ContactMatchStatus::Ambiguous, 'priority' => 1, 'matches' => $priority1];
        }

        $priority2 = array_values(array_filter($scoped, function (array $candidate) use ($local, $modular, $district): bool {
            return (string) ($candidate['codigo_local'] ?? '') === $local
                && (string) ($candidate['codigo_modular'] ?? '') === $modular
                && ($candidate['_dist_n'] ?? IdentifierNormalizer::normalizeName($candidate['distrito'] ?? null)) === $district
                && $local !== '' && $modular !== '' && $district !== '';
        }));

        if (count($priority2) === 1) {
            return ['status' => ContactMatchStatus::Matched, 'priority' => 2, 'matches' => $priority2];
        }
        if (count($priority2) > 1) {
            return ['status' => ContactMatchStatus::Ambiguous, 'priority' => 2, 'matches' => $priority2];
        }

        $priority3 = array_values(array_filter($scoped, function (array $candidate) use ($local, $name, $district): bool {
            return (string) ($candidate['codigo_local'] ?? '') === $local
                && ($candidate['_name_n'] ?? IdentifierNormalizer::normalizeName($candidate['local_educativo'] ?? null)) === $name
                && ($candidate['_dist_n'] ?? IdentifierNormalizer::normalizeName($candidate['distrito'] ?? null)) === $district
                && $local !== '' && $name !== '' && $district !== '';
        }));

        if (count($priority3) === 1) {
            return ['status' => ContactMatchStatus::Matched, 'priority' => 3, 'matches' => $priority3];
        }
        if (count($priority3) > 1) {
            return ['status' => ContactMatchStatus::Ambiguous, 'priority' => 3, 'matches' => $priority3];
        }

        return ['status' => ContactMatchStatus::Pending, 'priority' => null, 'matches' => []];
    }
}
