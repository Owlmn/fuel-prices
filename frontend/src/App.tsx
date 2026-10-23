'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Droplets, LoaderCircle, RefreshCw } from 'lucide-react'
import { ApiError, getMeta, getSnapshot } from './lib/api'
import type { Dataset, Meta, Snapshot } from './lib/contracts'
import { formatDate, type CalculatorState } from './lib/numbers'
import Workspace from './components/Workspace'

export default function App() {
  const [dataset, setDataset] = useState<Dataset>()
  const [error, setError] = useState<string>()
  const [pendingSnapshot, setPendingSnapshot] = useState<Snapshot>()
  const [newMeta, setNewMeta] = useState<Meta>()
  const [connecting, setConnecting] = useState(true)
  const [calculator, setCalculator] = useState<CalculatorState>({
    mode: 'bulk',
    volume: '1000',
    machines: [{ id: 'first', name: 'Трактор', liters: '200', count: '3' }],
    priceMode: 'regional',
    customPrice: '',
  })
  const controller = useRef<AbortController | undefined>(undefined)
  const switching = useRef(false)
  const client = useQueryClient()
  const activate = useCallback(
    (next: Dataset) => {
      client.cancelQueries()
      client.clear()
      setPendingSnapshot(undefined)
      setNewMeta(undefined)
      setError(undefined)
      setDataset(next)
      setConnecting(false)
    },
    [client],
  )
  const useReserve = useCallback(async () => {
    if (switching.current) return
    switching.current = true
    setDataset(undefined)
    setConnecting(true)
    try {
      const snapshot = await getSnapshot()
      const pinned = new URLSearchParams(window.location.search).get('dataset_version')
      if (pinned && pinned !== snapshot.meta.dataset_version) {
        setPendingSnapshot(snapshot)
        setError(
          'Сервис недоступен. В резерве другая версия данных: переключение изменит цифры и версию в ссылке.',
        )
        setConnecting(false)
      } else activate({ mode: 'snapshot', meta: snapshot.meta, snapshot })
    } catch {
      setError('Сервис и резервный снимок недоступны. Проверьте подключение и повторите попытку.')
      setConnecting(false)
    } finally {
      switching.current = false
    }
  }, [activate])
  const connect = useCallback(
    async (latest = false) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      setConnecting(true)
      setDataset(undefined)
      setPendingSnapshot(undefined)
      setError(undefined)
      try {
        const pinned = latest
          ? undefined
          : (new URLSearchParams(window.location.search).get('dataset_version') ?? undefined)
        const meta = await getMeta(current.signal, pinned)
        if (!current.signal.aborted) activate({ mode: 'api', meta })
      } catch (cause) {
        if (current.signal.aborted) return
        if (cause instanceof ApiError && cause.unavailable) await useReserve()
        else {
          setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные')
          setConnecting(false)
        }
      }
    },
    [activate, useReserve],
  )
  useEffect(() => {
    void connect()
    return () => controller.current?.abort()
  }, [connect])
  useEffect(() => {
    if (!dataset || dataset.mode !== 'api') return
    let lastCheck = Date.now()
    const current = new AbortController()
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 300_000) return
      lastCheck = Date.now()
      getMeta(current.signal)
        .then((meta) => {
          if (meta.active_version !== dataset.meta.dataset_version) setNewMeta(meta)
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    return () => {
      current.abort()
      document.removeEventListener('visibilitychange', check)
    }
  }, [dataset])
  if (!dataset)
    return (
      <div className="startup">
        <div className="brand-mark">
          <Droplets size={30} />
        </div>
        <h1>АгроТопливо</h1>
        {connecting ? (
          <>
            <LoaderCircle size={25} className="spin" />
            <p>Загружаем данные о ценах…</p>
          </>
        ) : (
          <>
            <p role="alert" aria-label="Ошибка загрузки данных">
              {error}
            </p>
            <div className="startup-actions">
              <button className="primary-button" onClick={() => void connect()}>
                <RefreshCw size={16} />
                Повторить подключение
              </button>
              {pendingSnapshot ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search)
                    params.set('dataset_version', pendingSnapshot.meta.dataset_version)
                    window.history.replaceState(null, '', `?${params}`)
                    activate({
                      mode: 'snapshot',
                      meta: pendingSnapshot.meta,
                      snapshot: pendingSnapshot,
                    })
                  }}
                >
                  Открыть резерв на {formatDate(pendingSnapshot.meta.expected_dates.at(-1), true)}
                </button>
              ) : (
                <button className="text-button" onClick={() => void connect(true)}>
                  Открыть последнюю версию
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  return (
    <Workspace
      key={`${dataset.mode}-${dataset.meta.dataset_version}`}
      dataset={dataset}
      calculator={calculator}
      setCalculator={setCalculator}
      onReserve={useReserve}
      onReconnect={() => void connect()}
      newMeta={newMeta}
      onUpdate={() => {
        if (newMeta) activate({ mode: 'api', meta: newMeta })
      }}
    />
  )
}
