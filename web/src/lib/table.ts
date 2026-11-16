import type { CellValue, ColumnKind, DataRow, TableColumn } from '@/types/detections'

export const DETECTION_COLUMNS: TableColumn[] = [
  { key: 'sensor', label: 'sensor', kind: 'text' },
  { key: 'acq_date', label: 'date', kind: 'text' },
  { key: 'acq_time', label: 'time (UTC)', kind: 'text' },
  { key: 'lat', label: 'lat (°)', kind: 'number' },
  { key: 'lon', label: 'lon (°)', kind: 'number' },
  { key: 'brightness_k', label: '4 µm (K)', kind: 'number' },
  { key: 'confidence', label: 'confidence', kind: 'confidence' },
  { key: 'frp', label: 'FRP (MW)', kind: 'number' },
  { key: 'scan_km', label: 'scan (km)', kind: 'number' },
  { key: 'track_km', label: 'track (km)', kind: 'number' },
  { key: 'type', label: 'type', kind: 'integer' },
]

export function inferColumnKind(values: CellValue[]): ColumnKind {
  const present = values.filter((value) => value !== null && value !== '')
  if (present.length === 0) return 'text'
  if (present.every((value) => typeof value === 'number' && Number.isInteger(value))) return 'integer'
  if (present.every((value) => typeof value === 'number')) return 'number'
  return 'text'
}

export function sqlColumns(columns: string[], rows: DataRow[]): TableColumn[] {
  return columns.map((key) => ({
    key,
    label: key,
    kind: key.toLowerCase().includes('confidence')
      ? 'confidence'
      : inferColumnKind(rows.map((row) => row[key] ?? null)),
  }))
}
