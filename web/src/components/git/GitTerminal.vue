<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TerminalLine } from '@/types/git'

const props = defineProps<{
  lines: readonly TerminalLine[]
  busy: boolean
}>()

const emit = defineEmits<{ submit: [input: string] }>()

const input = ref('')
const output = ref<HTMLElement | null>(null)
const field = ref<HTMLInputElement | null>(null)
const history = ref<string[]>([])
const cursor = ref(0)

const KIND_CLASS: Record<TerminalLine['kind'], string> = {
  info: 'text-ink',
  error: 'text-danger',
  muted: 'text-muted',
  echo: 'text-faint',
}

function scrollToEnd(): void {
  void nextTick(() => {
    const element = output.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function focus(): void {
  const element = field.value
  if (!element) return
  element.focus()
  const end = element.value.length
  element.setSelectionRange(end, end)
}

function submit(): void {
  const value = input.value.trim()
  if (!value || props.busy) return
  if (history.value[history.value.length - 1] !== value) history.value.push(value)
  cursor.value = history.value.length
  emit('submit', value)
  input.value = ''
  focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp') {
    if (history.value.length === 0) return
    event.preventDefault()
    cursor.value = Math.max(0, cursor.value - 1)
    input.value = history.value[cursor.value] ?? ''
    return
  }
  if (event.key === 'ArrowDown') {
    if (history.value.length === 0) return
    event.preventDefault()
    if (cursor.value < history.value.length - 1) {
      cursor.value += 1
      input.value = history.value[cursor.value]
    } else {
      cursor.value = history.value.length
      input.value = ''
    }
    return
  }
  if (event.key === 'Escape') {
    input.value = ''
    field.value?.blur()
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key.toLowerCase() !== 't') return
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
  if (event.defaultPrevented || isEditable(event.target)) return
  event.preventDefault()
  focus()
}

watch(
  () => props.lines.length,
  () => scrollToEnd(),
)

// The input is disabled while a query runs; refocus only after Vue re-enables it.
watch(
  () => props.busy,
  (busy) => {
    if (busy) return
    void nextTick(() => focus())
  },
)

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  scrollToEnd()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <section aria-label="Git terminal" class="flex h-full min-h-0 flex-col bg-panel">
    <div
      ref="output"
      role="log"
      aria-live="polite"
      aria-atomic="false"
      class="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-0.5 font-mono text-2xs leading-[15px]"
    >
      <p
        v-for="line in lines"
        :key="line.id"
        class="whitespace-pre-wrap break-words"
        :class="KIND_CLASS[line.kind]"
      >
        {{ line.text }}
      </p>
      <p v-if="lines.length === 0" class="text-faint">
        try log 58 59 -106 -104 --year 2023
      </p>
    </div>

    <form class="flex h-7 items-center gap-1 border-t border-edge px-2" @submit.prevent="submit">
      <span class="font-mono text-xs text-accent" aria-hidden="true">&gt;</span>
      <input
        ref="field"
        v-model="input"
        type="text"
        name="command"
        aria-label="Git terminal command"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="busy"
        class="h-6 min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-faint disabled:opacity-60"
        placeholder="help"
        @keydown="onKeydown"
      />
      <span v-if="busy" class="font-mono text-2xs text-muted">working…</span>
    </form>
  </section>
</template>
