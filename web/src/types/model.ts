export interface MultiplicityBin {
  label: string
  p: number
  ci: [number, number]
  events: number
  /** 1 / p: how many VIIRS-only cell-days this bin stands for. */
  correction: number
}

export interface ModelValidation {
  log_loss_canada_2023: {
    frp: number
    multiplicity: number
    frp_multiplicity: number
  }
  transfer: string
  shape: string
  ece: number
}

export interface ModelArtifact {
  schema: 'fire-model/1'
  region: string
  method: string
  unit: string
  reference_sensor: string
  estimate: string
  multiplicity_bins: MultiplicityBin[]
  validation: ModelValidation
  caveats: string[]
  generated_utc: string
}
