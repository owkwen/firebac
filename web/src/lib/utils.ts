import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
