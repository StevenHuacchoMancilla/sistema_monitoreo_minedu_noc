<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracking_records', function (Blueprint $table) {
            $table->string('public_id', 26)->nullable()->after('id');
            $table->string('case_code', 96)->nullable()->after('ticket');
            $table->string('report_ticket', 112)->nullable()->after('case_code');
        });

        // Backfill identity for any leftover rows (dev/test). New opens always generate codes.
        $rows = DB::table('tracking_records')->orderBy('id')->get(['id', 'ticket', 'tss_snapshot', 'cid_snapshot', 'opened_at', 'closed_at']);
        foreach ($rows as $row) {
            $publicId = (string) \Illuminate\Support\Str::ulid();
            $suffix = substr($publicId, 0, 8);
            $tss = preg_replace('/\D+/', '', (string) ($row->tss_snapshot ?? '')) ?: '0';
            $cid = preg_replace('/\D+/', '', (string) ($row->cid_snapshot ?? '')) ?: '0';
            $opened = $row->opened_at
                ? \Carbon\Carbon::parse($row->opened_at)->timezone('America/Lima')->format('YmdHis')
                : now('America/Lima')->format('YmdHis');
            $caseCode = "INC{$tss}_{$cid}_A{$opened}_{$suffix}";
            $reportTicket = $row->closed_at
                ? 'INC'.$tss.'_'.$cid.'_A'.$opened.'_C'.\Carbon\Carbon::parse($row->closed_at)->timezone('America/Lima')->format('YmdHis').'_'.$suffix
                : "INC{$tss}_{$cid}_A{$opened}_COPEN_{$suffix}";

            DB::table('tracking_records')->where('id', $row->id)->update([
                'public_id' => $publicId,
                'case_code' => $caseCode,
                'report_ticket' => $reportTicket,
                'ticket' => $reportTicket,
            ]);
        }

        Schema::table('tracking_records', function (Blueprint $table) {
            $table->unique('public_id');
            $table->unique('case_code');
            $table->unique('report_ticket');
            $table->index('opened_by_user_id');
            $table->index('closed_by_user_id');
        });

        // 1 incidente → 1 Tracking (NULLs permitidos en PostgreSQL/SQLite bajo UNIQUE).
        DB::statement('DROP INDEX IF EXISTS tracking_records_one_open_per_incident');

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('
                CREATE UNIQUE INDEX tracking_records_incident_id_unique
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
            ');
        } else {
            DB::statement('
                CREATE UNIQUE INDEX tracking_records_incident_id_unique
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
            ');
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS tracking_records_incident_id_unique');

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement("
                CREATE UNIQUE INDEX tracking_records_one_open_per_incident
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
                  AND status <> 'CLOSED'
            ");
        } else {
            DB::statement("
                CREATE UNIQUE INDEX tracking_records_one_open_per_incident
                ON tracking_records (incident_id)
                WHERE incident_id IS NOT NULL
                  AND status != 'CLOSED'
            ");
        }

        Schema::table('tracking_records', function (Blueprint $table) {
            $table->dropUnique(['public_id']);
            $table->dropUnique(['case_code']);
            $table->dropUnique(['report_ticket']);
            $table->dropIndex(['opened_by_user_id']);
            $table->dropIndex(['closed_by_user_id']);
            $table->dropColumn(['public_id', 'case_code', 'report_ticket']);
        });
    }
};
