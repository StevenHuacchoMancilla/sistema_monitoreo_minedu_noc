<?php

namespace App\Domain\Tracking\Support;

use App\Support\OperationalTime;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Identidad humana e inmutable de Tracking General.
 *
 * public_id: ULID completo (inmutable)
 * case_code: INC{TSS}_{CID}_A{YmdHis}_{suffix} (inmutable)
 * report_ticket: …_COPEN_{suffix} | …_C{YmdHis}_{suffix} (mutable solo al cerrar/reabrir)
 */
final class TrackingTicketCodes
{
    /**
     * @return array{public_id: string, suffix: string, case_code: string, report_ticket: string}
     */
    public function mint(string $tss, string $cid, CarbonInterface $openedAt): array
    {
        $tssNorm = $this->digitsOrZero($tss);
        $cidNorm = $this->digitsOrZero($cid);
        $openStamp = $openedAt->copy()->timezone(OperationalTime::tz())->format('YmdHis');

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $publicId = (string) Str::ulid();
            $suffix = substr($publicId, 0, 8);
            $caseCode = sprintf('INC%s_%s_A%s_%s', $tssNorm, $cidNorm, $openStamp, $suffix);
            $reportTicket = sprintf('INC%s_%s_A%s_COPEN_%s', $tssNorm, $cidNorm, $openStamp, $suffix);

            return [
                'public_id' => $publicId,
                'suffix' => $suffix,
                'case_code' => $caseCode,
                'report_ticket' => $reportTicket,
            ];
        }

        throw new InvalidArgumentException('No se pudo generar identidad Tracking.');
    }

    public function reportTicketOpen(string $caseCode): string
    {
        if (! preg_match('/^(INC.+_A\d{14})_(.+)$/', $caseCode, $m)) {
            return $caseCode.'_COPEN';
        }

        return $m[1].'_COPEN_'.$m[2];
    }

    public function reportTicketClosed(string $caseCode, CarbonInterface $closedAt): string
    {
        $closeStamp = $closedAt->copy()->timezone(OperationalTime::tz())->format('YmdHis');

        if (! preg_match('/^(INC.+_A\d{14})_(.+)$/', $caseCode, $m)) {
            return $caseCode.'_C'.$closeStamp;
        }

        return $m[1].'_C'.$closeStamp.'_'.$m[2];
    }

    private function digitsOrZero(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits !== '' ? $digits : '0';
    }
}
