export interface InputFile {
  file: string
  bytes: number
  rows: number
  sha256: string
}

export interface MetaArtifact {
  schema: 'fire-meta/1'
  generated_utc: string
  region: string
  grid_deg: number
  map_deg: number
  rows: {
    detections: number
    cell_days: number
  }
  inputs: InputFile[]
  software: Record<string, string>
}

export interface RegionEntry {
  code: string
  name: string
}
