import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { Button } from '../../../components/ui/Button'
import type { IncidentAttachment, IncidentDetail } from '../../../types/api'

export function EvidenceAttachmentsPanel({
  incidentId,
  attachments,
  readOnly,
}: {
  incidentId: number
  attachments: IncidentAttachment[]
  readOnly: boolean
}) {
  const client = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: IncidentAttachment[] = []
      const failures: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress(`Subiendo ${i + 1} de ${files.length}…`)
        try {
          const res = await endpoints.uploadAttachment(incidentId, file)
          uploaded.push(res.data)
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Error al subir'
          failures.push(`${file.name}: ${reason}`)
        }
      }
      return { uploaded, failures }
    },
    onSuccess: async ({ uploaded, failures }) => {
      setProgress(null)
      if (uploaded.length > 0) {
        client.setQueryData<IncidentDetail>(['incidents', incidentId], (prev) => {
          if (!prev) return prev
          return { ...prev, attachments: [...uploaded, ...(prev.attachments ?? [])] }
        })
        await client.invalidateQueries({ queryKey: ['incidents', incidentId] })
      }
      if (failures.length > 0) {
        setError(
          uploaded.length > 0
            ? `Se subieron ${uploaded.length}. Fallaron: ${failures.join(' · ')}`
            : failures.join(' · '),
        )
      } else {
        setError(null)
      }
    },
    onError: (err: unknown) => {
      setProgress(null)
      setError(err instanceof Error ? err.message : 'No se pudieron subir las imágenes.')
    },
  })

  const remove = useMutation({
    mutationFn: (attachmentId: number) => endpoints.deleteAttachment(incidentId, attachmentId),
    onSuccess: async (_res, attachmentId) => {
      setError(null)
      client.setQueryData<IncidentDetail>(['incidents', incidentId], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          attachments: (prev.attachments ?? []).filter((a) => a.id !== attachmentId),
        }
      })
      await client.invalidateQueries({ queryKey: ['incidents', incidentId] })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'No se pudo eliminar.'),
  })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            <ImagePlus className="h-4 w-4" aria-hidden />
            Evidencias (imagen)
          </h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Puedes subir una o varias fotos a la vez (JPG, PNG, WEBP o GIF · máx. 5 MB c/u).
          </p>
        </div>
        {!readOnly ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(event) => {
                const list = event.target.files
                event.target.value = ''
                if (!list || list.length === 0) return
                const files = Array.from(list)
                setError(null)
                upload.mutate(files)
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? progress ?? 'Subiendo…' : 'Subir imágenes'}
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {attachments.length === 0 ? (
        <p className="text-[13px] text-slate-500">Sin evidencias cargadas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <a href={item.url} target="_blank" rel="noreferrer" className="block bg-slate-50 dark:bg-slate-950">
                <img
                  src={item.url}
                  alt={item.original_name}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                />
              </a>
              <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-slate-800 dark:text-slate-100" title={item.original_name}>
                    {item.original_name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {item.uploaded_by ?? 'Usuario'}
                    {item.size ? ` · ${(item.size / 1024).toFixed(0)} KB` : ''}
                  </p>
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    title="Eliminar"
                    aria-label={`Eliminar ${item.original_name}`}
                    disabled={remove.isPending}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
