export function parseNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (value == null) {
    return 0
  }
  const normalized = String(value).replace(/,/g, '').trim()
  if (!normalized) {
    return 0
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const negative = value < 0
  const fixed = Math.abs(value).toFixed(digits)
  const parts = fixed.split('.')
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimal = parts[1]
  const result = decimal ? `${integer}.${decimal}` : integer
  return negative ? `-${result}` : result
}

export function formatYen(value: number): string {
  return formatNumber(Math.round(value), 0)
}

export function formatCNY(value: number): string {
  if (!Number.isFinite(value)) {
    return '¥0.00'
  }
  const sign = value < 0 ? '-' : ''
  return `${sign}¥${formatNumber(Math.abs(value), 2)}`
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.0000'
  }
  return value.toFixed(4)
}

export function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return '0%'
  }
  const fixed = value.toFixed(digits)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return `${trimmed}%`
}

export function formatPctValue(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.?0+$/, '')
}

export function formatTime(timestamp: number): string {
  if (!timestamp) {
    return ''
  }
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  const hour = pad2(date.getHours())
  const minute = pad2(date.getMinutes())
  return `${year}/${month}/${day} ${hour}:${minute}`
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

export function formatShortTime(timestamp: number): string {
  if (!timestamp) {
    return ''
  }
  const date = new Date(timestamp)
  const hour = pad2(date.getHours())
  const minute = pad2(date.getMinutes())
  return `${hour}:${minute}`
}
