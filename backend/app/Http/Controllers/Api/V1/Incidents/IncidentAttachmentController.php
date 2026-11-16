<?php

namespace App\Http\Controllers\Api\V1\Incidents;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\IncidentAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class IncidentAttachmentController extends Controller
{
    private const MAX_BYTES = 5 * 1024 * 1024;

    private const ALLOWED_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
    ];

    public function index(Incident $incident): JsonResponse
    {
        $rows = $incident->attachments()
            ->with('user:id,name')
            ->orderByDesc('id')
            ->get()
            ->map(fn (IncidentAttachment $a) => $a->toApi())
            ->values()
            ->all();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, Incident $incident): JsonResponse
    {
        $uploadError = $this->phpUploadErrorMessage($request);
        if ($uploadError !== null) {
            throw ValidationException::withMessages(['file' => $uploadError]);
        }

        $request->validate([
            'file' => ['required', 'file', 'max:5120'],
        ]);

        $file = $request->file('file');
        if ($file === null) {
            throw ValidationException::withMessages(['file' => 'Archivo requerido.']);
        }

        $mime = (string) ($file->getMimeType() ?: '');
        if (! in_array($mime, self::ALLOWED_MIMES, true)) {
            throw ValidationException::withMessages([
                'file' => 'Solo se permiten imágenes JPG, PNG, WEBP o GIF.',
            ]);
        }

        if ($file->getSize() > self::MAX_BYTES) {
            throw ValidationException::withMessages([
                'file' => 'La imagen no puede superar 5 MB.',
            ]);
        }

        $path = $file->store('ticket-evidence/'.$incident->id, 'public');
        if (! is_string($path) || $path === '') {
            return response()->json(['message' => 'No se pudo guardar la imagen.'], 500);
        }

        $attachment = IncidentAttachment::query()->create([
            'incident_id' => $incident->id,
            'user_id' => $request->user()?->id,
            'path' => $path,
            'original_name' => $file->getClientOriginalName() ?: basename($path),
            'mime' => $mime,
            'size' => (int) $file->getSize(),
        ]);
        $attachment->load('user:id,name');

        return response()->json(['data' => $attachment->toApi()], 201);
    }

    public function destroy(Incident $incident, IncidentAttachment $attachment): JsonResponse
    {
        if ((int) $attachment->incident_id !== (int) $incident->id) {
            return response()->json(['message' => 'Adjunto no pertenece al ticket.'], 404);
        }

        if ($attachment->path && Storage::disk('public')->exists($attachment->path)) {
            Storage::disk('public')->delete($attachment->path);
        }
        $attachment->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * PHP descarta el archivo antes de Laravel si supera upload_max_filesize.
     * Sin este chequeo el front solo ve "Archivo requerido".
     */
    private function phpUploadErrorMessage(Request $request): ?string
    {
        $file = $request->file('file');
        if ($file !== null && $file->isValid()) {
            return null;
        }

        $err = UPLOAD_ERR_NO_FILE;
        if ($file !== null) {
            $err = $file->getError();
        } elseif (isset($_FILES['file']['error']) && is_numeric($_FILES['file']['error'])) {
            $err = (int) $_FILES['file']['error'];
        }

        return match ($err) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'La imagen supera el límite del servidor (máx. 5 MB). Comprime la foto e intenta de nuevo.',
            UPLOAD_ERR_PARTIAL => 'La subida se interrumpió. Intenta de nuevo.',
            UPLOAD_ERR_NO_FILE => null,
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION => 'No se pudo guardar la imagen en el servidor.',
            default => null,
        };
    }
}
