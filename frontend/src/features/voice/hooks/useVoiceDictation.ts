import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceDictationLang = 'es-PE' | 'es-ES'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isVoiceDictationSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

/**
 * Dictado por voz vía Web Speech API.
 * Solo convierte voz → texto; no graba ni almacena audio.
 * En producción requiere HTTPS (o localhost) y permiso del navegador.
 */
export function useVoiceDictation(options?: {
  lang?: VoiceDictationLang
  onTranscript?: (text: string, isFinal: boolean) => void
}) {
  const lang = options?.lang ?? 'es-PE'
  const onTranscriptRef = useRef(options?.onTranscript)
  onTranscriptRef.current = options?.onTranscript

  const [supported] = useState(() => isVoiceDictationSupported())
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('El dictado por voz no está disponible en este navegador.')
      return
    }

    setError(null)

    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalChunk += transcript
        } else {
          interimChunk += transcript
        }
      }
      if (finalChunk) {
        onTranscriptRef.current?.(finalChunk, true)
      } else if (interimChunk) {
        onTranscriptRef.current?.(interimChunk, false)
      }
    }

    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown'
      if (code === 'aborted' || code === 'no-speech') {
        setListening(false)
        return
      }
      if (code === 'not-allowed') {
        setError('Permiso de micrófono denegado. Habilítalo en el navegador.')
      } else {
        setError(`No se pudo dictar (${code}).`)
      }
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('No se pudo iniciar el micrófono.')
      setListening(false)
    }
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return {
    supported,
    listening,
    error,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  }
}
