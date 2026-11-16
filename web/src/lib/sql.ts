export interface SavedQuery {
  id: string
  label: string
  sql: string
}

export const SAVED_QUERIES: SavedQuery[] = [
  {
    id: 'counts-by-sensor',
    label: 'Counts by sensor',
    sql: `SELECT sensor, COUNT(*) AS detections
FROM detections
GROUP BY sensor
ORDER BY detections DESC;`,
  },
  {
    id: 'confidence-distribution',
    label: 'Confidence distribution',
    sql: `SELECT sensor, confidence, COUNT(*) AS detections
FROM detections
GROUP BY sensor, confidence
ORDER BY sensor, confidence;`,
  },
  {
    id: 'top-frp',
    label: 'Top FRP rows',
    sql: `SELECT sensor, acq_date, acq_time, lat, lon, frp, confidence
FROM detections
ORDER BY frp DESC
LIMIT 25;`,
  },
]

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|copy|export|import|install|load|pragma|set|reset|call|truncate|vacuum|checkpoint|begin|commit|rollback)\b/i

// Strip literals and comments before scanning for statement keywords so a value such
// as 'created' cannot trigger the write guard.
function scrub(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
}

export function prepareReadOnlyQuery(sql: string): string {
  const trimmed = sql.trim()
  if (!trimmed) throw new Error('Query is empty')
  const scrubbed = scrub(trimmed).trim().replace(/;+\s*$/, '')
  if (scrubbed.includes(';')) throw new Error('Only one statement is allowed')
  if (!/^(select|with)\b/i.test(scrubbed)) throw new Error('Only SELECT / WITH queries are allowed')
  if (FORBIDDEN.test(scrubbed)) throw new Error('Write and administration keywords are blocked')
  return trimmed.replace(/;+\s*$/, '')
}
