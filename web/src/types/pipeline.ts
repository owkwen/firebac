import type { CalendarArtifact } from '@/types/calendar'
import type { DensityIndex } from '@/types/detections'
import type { MetaArtifact, RegionEntry } from '@/types/meta'
import type { ModelArtifact } from '@/types/model'

export type StageStatus = 'live' | 'validation' | 'rejected'
export type StageLane = 'build' | 'aoi' | 'rejected'
export type SensorTone = 'modis' | 'viirs' | 'shared'

export interface StageRow {
  label: string
  value: string
  note?: string
}

export interface StageMaths {
  label: string
  text: string
}

export interface StageTable {
  caption: string
  columns: string[]
  rows: string[][]
}

export interface PipelineStage {
  id: string
  title: string
  oneLine: string
  lane: StageLane
  status: StageStatus
  sensor: SensorTone
  /** Short label and line used inside the diagram; both come from the artifacts. */
  diagram: { label: string; sub: string }
  findings: string[]
  what: string
  inOut: StageRow[]
  maths: StageMaths[]
  table?: StageTable
  code: string[]
  note?: string
}

export interface PipelineCounts {
  region: string
  regionName: string
  inputs: number
  inputRows: number
  inputBytes: number
  detections: number
  cellDays: number
  densityCells: number | null
  densityBytes: number | null
  celldaysBytes: number | null
  aoiCellDays: number | null
  aoiYears: number[]
  buildYears: number[]
  generatedUtc: string
}

export interface PipelineModel {
  counts: PipelineCounts
  buildStages: PipelineStage[]
  aoiStages: PipelineStage[]
  rejectedStages: PipelineStage[]
  allStages: PipelineStage[]
}

export interface PipelineInput {
  region: string
  meta: MetaArtifact | null
  model: ModelArtifact | null
  calendar: CalendarArtifact | null
  density: DensityIndex | null
  regions: RegionEntry[]
}

export type FlowDirection = 'horizontal' | 'vertical'

export interface FlowNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  detail: string[]
  meta: string | null
  sensor: SensorTone
  status: StageStatus
  dashed: boolean
}

export interface FlowEdge {
  d: string
  sensor: SensorTone
}

export interface FlowLabel {
  x: number
  y: number
  text: string
}

export interface FlowLayout {
  id: FlowDirection
  width: number
  height: number
  nodes: FlowNode[]
  edges: FlowEdge[]
  labels: FlowLabel[]
}
