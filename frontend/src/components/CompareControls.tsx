import { X } from 'lucide-react'
import type { Meta, Selection } from '../lib/contracts'
import RegionPicker from './RegionPicker'
import { lineColors } from '../lib/presentation'

export default function CompareControls({
  meta,
  selection,
  onChange,
}: {
  meta: Meta
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
}) {
  return (
    <div className="comparison-controls" aria-label="Регионы для сравнения">
      <div className="region-chips">
        {[selection.region, ...selection.compare].map((id, index) => (
          <span key={id} className="region-chip">
            <i style={{ background: lineColors[index] }} />
            {meta.regions.find((region) => region.id === id)?.name}
            {index === 0 ? (
              <small>база</small>
            ) : (
              <button
                aria-label={`Убрать ${meta.regions.find((region) => region.id === id)?.name}`}
                onClick={() =>
                  onChange({ compare: selection.compare.filter((region) => region !== id) })
                }
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
      </div>
      {selection.compare.length < 2 && (
        <RegionPicker
          label="Добавить регион"
          value=""
          regions={meta.regions}
          exclude={[selection.region, ...selection.compare]}
          onChange={(region) => onChange({ compare: [...selection.compare, region] })}
        />
      )}
    </div>
  )
}
