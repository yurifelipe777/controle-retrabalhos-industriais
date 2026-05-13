import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

export function calcAgingDays(openedAt: string | null | undefined): number {
  if (!openedAt) return 0
  return differenceInDays(new Date(), parseISO(openedAt))
}

export function getAgingColor(days: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (days <= 2) return 'green'
  if (days <= 5) return 'yellow'
  if (days <= 10) return 'orange'
  return 'red'
}

export function getAgingClass(days: number): string {
  const color = getAgingColor(days)
  const map = {
    green: 'status-green',
    yellow: 'status-yellow',
    orange: 'status-orange',
    red: 'status-red',
  }
  return map[color]
}

export function normalizePartNumber(pn: string): string {
  return pn.replace(/[.\s/\-]/g, '').replace(/[^a-zA-Z0-9]/g, '')
}

export function formatQuantity(qty: number | null | undefined): string {
  if (qty == null) return '—'
  return qty.toLocaleString('pt-BR')
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}
