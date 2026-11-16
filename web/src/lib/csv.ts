import type { DataRow, TableColumn } from '@/types/detections'

const NEEDS_QUOTES = /[",\r\n]/

function cellToCsv(value: DataRow[string]): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(columns: TableColumn[], rows: DataRow[]): string {
  const header = columns.map((column) => cellToCsv(column.label)).join(',')
  const body = rows.map((row) => columns.map((column) => cellToCsv(row[column.key] ?? null)).join(','))
  return [header, ...body].join('\r\n')
}
