<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent text-canvas hover:bg-accent/90',
        outline: 'border-edge-strong bg-raised text-ink hover:border-accent hover:text-accent',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-raised hover:text-ink',
      },
      size: {
        sm: 'h-7 px-2',
        md: 'h-8 px-3',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    type?: 'button' | 'submit'
  }>(),
  { variant: 'outline', size: 'md', type: 'button' },
)
</script>

<template>
  <button :type="props.type" :class="cn(buttonVariants({ variant: props.variant, size: props.size }))">
    <slot />
  </button>
</template>
