<script setup lang="ts">
import {
  createColumnHelper,
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useVueTable,
} from '@tanstack/vue-table'
import { computed, ref } from 'vue'
import type { CellValue, DataRow, TableColumn } from '@/types/detections'
import { formatCell } from '@/lib/format'

const props = defineProps<{ columns: TableColumn[]; rows: DataRow[]; caption: string }>()
const sorting = ref<SortingState>([])

const columnHelper = createColumnHelper<DataRow>()

const tableColumns = computed(() =>
  props.columns.map((column) =>
    columnHelper.accessor((row) => row[column.key] ?? null, {
      id: column.key,
      header: column.label,
      cell: (info) => formatCell(info.getValue() as CellValue, column.kind),
      sortingFn: 'basic',
    }),
  ),
)

function isNumeric(key: string): boolean {
  const column = props.columns.find((entry) => entry.key === key)
  return column?.kind === 'number' || column?.kind === 'integer'
}

const table = useVueTable({
  get data() {
    return props.rows
  },
  get columns() {
    return tableColumns.value
  },
  state: {
    get sorting() {
      return sorting.value
    },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})
</script>

<template>
  <div class="scroll-thin max-h-[420px] overflow-auto rounded-[var(--radius)] border border-edge">
    <table class="w-full border-collapse text-left text-2xs tnum">
      <caption class="sr-only">{{ caption }}</caption>
      <thead class="sticky top-0 z-10 bg-raised">
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            scope="col"
            class="whitespace-nowrap border-b border-edge px-2 py-1 font-mono font-medium text-muted"
            :class="isNumeric(header.column.id) ? 'text-right' : ''"
          >
            <button
              v-if="!header.isPlaceholder"
              type="button"
              class="flex items-center gap-1 hover:text-ink"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
              <span v-if="header.column.getIsSorted()" class="text-accent">
                {{ header.column.getIsSorted() === 'asc' ? '↑' : '↓' }}
              </span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in table.getRowModel().rows" :key="row.id" class="odd:bg-sunken/40 hover:bg-raised">
          <td
            v-for="cell in row.getVisibleCells()"
            :key="cell.id"
            class="whitespace-nowrap border-b border-edge/50 px-2 py-1 text-ink"
            :class="isNumeric(cell.column.id) ? 'text-right' : ''"
          >
            <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
