<script setup lang="ts">
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { type ECharts, type EChartsCoreOption, init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = defineProps<{ option: EChartsCoreOption; description: string }>()
const host = useTemplateRef<HTMLDivElement>('host')
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  chart = init(host.value, undefined, { renderer: 'canvas' })
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(host.value)
})

watch(
  () => props.option,
  (option) => chart?.setOption(option, true),
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="host" class="h-full w-full" role="img" :aria-label="description" />
</template>
