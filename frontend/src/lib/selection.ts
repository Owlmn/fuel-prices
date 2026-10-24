import { fuelSchema, MAX_COMPARE_REGIONS, type Meta, type Selection } from './contracts'

export type View = 'overview' | 'comparison' | 'calculator' | 'sources'
export function periodStart(end: string, weeks: number, min: string) {
  const date = new Date(`${end}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - (weeks - 1) * 7)
  return [date.toISOString().slice(0, 10), min].sort().at(-1)!
}
export function readSelection(meta: Meta, search = window.location.search) {
  const params = new URLSearchParams(search)
  const available = meta.regions.filter((region) => region.available)
  const defaultRegion =
    available.find((region) => region.id === 'primorsky_krai')?.id ?? available[0].id
  const validRegion = (id: string | null): id is string =>
    available.some((region) => region.id === id)
  const latest = meta.expected_dates.at(-1)!
  const earliest = meta.expected_dates[0]
  const region = validRegion(params.get('region')) ? params.get('region')! : defaultRegion
  const fuel = fuelSchema.safeParse(params.get('fuel'))
  const validDate = (value: string | null): value is string =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= earliest &&
    value <= latest
  let from = params.get('from')
  let to = params.get('to')
  const datesValid = validDate(from) && validDate(to) && from <= to
  if (!datesValid) {
    from = periodStart(latest, 4, earliest)
    to = latest
  }
  const requested = params.getAll('compare').filter(Boolean)
  const defaults = ['khabarovsk_krai', 'amur_oblast'].filter(
    (id) => validRegion(id) && id !== region,
  )
  const compare = [...new Set(requested.filter((id) => validRegion(id) && id !== region))].slice(
    0,
    MAX_COMPARE_REGIONS,
  )
  const initialCompare = params.has('compare') ? compare : defaults
  const corrected =
    (params.has('region') && params.get('region') !== region) ||
    (params.has('fuel') && !fuel.success) ||
    ((params.has('from') || params.has('to')) && !datesValid) ||
    (requested.length > 0 && requested.join() !== compare.join())
  const requestedView = params.get('view')
  const view: View =
    requestedView === 'comparison' || requestedView === 'calculator' || requestedView === 'sources'
      ? requestedView
      : 'overview'
  return {
    selection: {
      region,
      fuel: fuel.success ? fuel.data : 'diesel',
      from: from!,
      to: to!,
      compare: initialCompare,
    } as Selection,
    view,
    corrected,
  }
}
export function selectionUrl(selection: Selection, view: View, version: string) {
  const params = new URLSearchParams({
    region: selection.region,
    fuel: selection.fuel,
    from: selection.from,
    to: selection.to,
    dataset_version: version,
    view,
  })
  if (!selection.compare.length) params.append('compare', '')
  else selection.compare.forEach((region) => params.append('compare', region))
  return `?${params}`
}
