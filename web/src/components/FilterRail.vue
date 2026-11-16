<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import Input from '@/components/ui/Input.vue'
import ConfidenceSplit from '@/components/filters/ConfidenceSplit.vue'
import DatasetChooser from '@/components/filters/DatasetChooser.vue'
import { FIRE_TYPES, SENSORS } from '@/lib/constants'
import type { DatasetInfo, Sensor } from '@/types/dataset'
import type { FilterState, ViirsConfidence } from '@/types/filters'

const props = defineProps<{ datasets: DatasetInfo[]; filters: FilterState; busy: boolean; dirty: boolean }>()
const emit = defineEmits<{ 'update:filters': [filters: FilterState]; run: [] }>()

const selectedSensors = computed(
  () => new Set(props.datasets.filter((dataset) => props.filters.datasets.includes(dataset.file)).map((d) => d.sensor)),
)

function patch(partial: Partial<FilterState>): void {
  emit('update:filters', { ...props.filters, ...partial })
}

function toggleDataset(file: string): void {
  const selected = props.filters.datasets.includes(file)
    ? props.filters.datasets.filter((entry) => entry !== file)
    : [...props.filters.datasets, file]
  if (selected.length === 0) return
  const available = SENSORS.filter((sensor) =>
    props.datasets.some((dataset) => selected.includes(dataset.file) && dataset.sensor === sensor),
  )
  const sensors = props.filters.sensors.filter((sensor) => available.includes(sensor))
  patch({ datasets: selected, sensors: sensors.length > 0 ? sensors : available })
}

function toggleSensor(sensor: Sensor): void {
  const selected = props.filters.sensors.includes(sensor)
    ? props.filters.sensors.filter((entry) => entry !== sensor)
    : SENSORS.filter((entry) => props.filters.sensors.includes(entry) || entry === sensor)
  if (selected.length > 0) patch({ sensors: selected })
}

function toggleType(value: number): void {
  const selected = props.filters.types.includes(value)
    ? props.filters.types.filter((entry) => entry !== value)
    : [...props.filters.types, value]
  if (selected.length > 0) patch({ types: selected })
}

function setDate(field: 'dateFrom' | 'dateTo', value: string): void {
  if (!value) return
  const next = { ...props.filters, [field]: value }
  if (next.dateFrom > next.dateTo) {
    if (field === 'dateFrom') next.dateTo = value
    else next.dateFrom = value
  }
  patch({ dateFrom: next.dateFrom, dateTo: next.dateTo })
}

function setModisMin(value: number): void {
  patch({ modisMin: value })
}

function setViirsMin(value: ViirsConfidence): void {
  patch({ viirsMin: value })
}
</script>

<template>
  <aside class="scroll-thin flex flex-col gap-4 overflow-y-auto border-r border-edge bg-panel p-3 lg:w-72 lg:shrink-0">
    <section>
      <h2 class="mb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Dataset</h2>
      <DatasetChooser :datasets="datasets" :selected="filters.datasets" @toggle="toggleDataset" />
    </section>

    <section>
      <h2 class="mb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Sensor</h2>
      <div class="flex gap-4">
        <Checkbox
          v-for="sensor in SENSORS"
          :key="sensor"
          :label="sensor"
          :model-value="filters.sensors.includes(sensor)"
          :disabled="!selectedSensors.has(sensor)"
          @update:model-value="toggleSensor(sensor)"
        />
      </div>
    </section>

    <section>
      <h2 class="mb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Date range</h2>
      <div class="grid grid-cols-2 gap-1.5">
        <Input
          :model-value="filters.dateFrom"
          type="date"
          aria-label="Start date"
          @update:model-value="setDate('dateFrom', $event)"
        />
        <Input
          :model-value="filters.dateTo"
          type="date"
          aria-label="End date"
          @update:model-value="setDate('dateTo', $event)"
        />
      </div>
    </section>

    <section>
      <h2 class="mb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Fire type</h2>
      <div class="space-y-1.5">
        <Checkbox
          v-for="type in FIRE_TYPES"
          :key="type.value"
          :label="type.label"
          :model-value="filters.types.includes(type.value)"
          @update:model-value="toggleType(type.value)"
        />
      </div>
    </section>

    <section>
      <h2 class="mb-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted">Confidence split</h2>
      <ConfidenceSplit
        :modis-min="filters.modisMin"
        :viirs-min="filters.viirsMin"
        @update:modis-min="setModisMin"
        @update:viirs-min="setViirsMin"
      />
    </section>

    <div class="mt-auto space-y-1.5 border-t border-edge pt-3">
      <Button variant="primary" class="w-full" :disabled="busy" @click="emit('run')">
        {{ busy ? 'Running…' : 'Run query' }}
      </Button>
      <p class="text-2xs leading-4 text-faint">
        <span v-if="dirty" class="mr-1 inline-block size-1.5 rounded-full bg-accent" aria-hidden="true" />
        Filters live in the URL; Run applies them to every panel.
      </p>
    </div>
  </aside>
</template>
