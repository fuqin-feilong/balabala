import { formatCNY } from './format'

export type QuoteMode = 'pct' | 'fixed' | 'both'
export type QuoteBasis = 'costPlus' | 'margin'
export type QuoteRounding = 0 | 10 | 50 | 100
export type QuoteValidity = 'none' | 'today' | '3' | '7'

export interface QuoteInput {
  costCNY: number
  extraFeeCNY: number
  mode: QuoteMode
  profitPcts: number[]
  fixedAdds: number[]
  basis: QuoteBasis
  floorPct: number
  rounding: QuoteRounding
}

export interface QuoteLine {
  key: string
  kind: 'pct' | 'fixed'
  label: string
  targetPct: number
  quoteCNY: number
  profitCNY: number
  /** 实际毛利率 = 利润 ÷ 报价 */
  marginPct: number
  belowFloor: boolean
}

export interface QuoteResult {
  baseCost: number
  lines: QuoteLine[]
  skipped: number
  warnings: string[]
}

export function uniqueNumbers(values: number[]): number[] {
  const seen: Record<string, boolean> = {}
  const result: number[] = []
  values.forEach(value => {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) {
      return
    }
    const key = String(number)
    if (seen[key]) {
      return
    }
    seen[key] = true
    result.push(number)
  })
  return result
}

function roundUpTo(value: number, step: QuoteRounding): number {
  if (!step) {
    return Math.round(value * 100) / 100
  }
  return Math.ceil(value / step) * step
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function buildQuotes(input: QuoteInput): QuoteResult {
  const baseCost = Math.max(0, input.costCNY) + Math.max(0, input.extraFeeCNY)
  const warnings: string[] = []
  const lines: QuoteLine[] = []
  let skipped = 0

  if (baseCost <= 0) {
    return { baseCost: 0, lines, skipped, warnings }
  }

  const floorPct = Math.max(0, input.floorPct || 0)

  if (input.mode === 'pct' || input.mode === 'both') {
    uniqueNumbers(input.profitPcts).forEach(pct => {
      if (floorPct > 0 && pct < floorPct) {
        skipped += 1
        return
      }
      if (input.basis === 'margin' && pct >= 100) {
        skipped += 1
        if (warnings.indexOf('毛利口径的利润率必须小于 100%') < 0) {
          warnings.push('毛利口径的利润率必须小于 100%')
        }
        return
      }
      const raw =
        input.basis === 'margin'
          ? baseCost / (1 - pct / 100)
          : baseCost * (1 + pct / 100)
      const quoteCNY = roundUpTo(raw, input.rounding)
      const profitCNY = round2(quoteCNY - baseCost)
      lines.push({
        key: `pct_${pct}`,
        kind: 'pct',
        label:
          input.basis === 'margin' ? `毛利 ${pct}%` : `成本 +${pct}%`,
        targetPct: pct,
        quoteCNY,
        profitCNY,
        marginPct: quoteCNY > 0 ? round2((profitCNY / quoteCNY) * 100) : 0,
        belowFloor: floorPct > 0 && pct < floorPct,
      })
    })
  }

  if (input.mode === 'fixed' || input.mode === 'both') {
    uniqueNumbers(input.fixedAdds).forEach(add => {
      const quoteCNY = roundUpTo(baseCost + add, input.rounding)
      const profitCNY = round2(quoteCNY - baseCost)
      const marginPct = quoteCNY > 0 ? round2((profitCNY / quoteCNY) * 100) : 0
      const belowFloor = floorPct > 0 && marginPct < floorPct
      lines.push({
        key: `fixed_${add}`,
        kind: 'fixed',
        label: `加价 ¥${add}`,
        targetPct: marginPct,
        quoteCNY,
        profitCNY,
        marginPct,
        belowFloor,
      })
    })
  }

  if (!lines.length) {
    const wantsPct =
      (input.mode === 'pct' || input.mode === 'both') &&
      uniqueNumbers(input.profitPcts).length > 0
    const wantsFixed =
      (input.mode === 'fixed' || input.mode === 'both') &&
      uniqueNumbers(input.fixedAdds).length > 0
    if (!wantsPct && !wantsFixed) {
      warnings.push('请至少选择一个利润率或固定加价')
    }
  }

  if (skipped > 0) {
    warnings.push(`有 ${skipped} 条报价低于利润率底线或口径不合法，已隐藏`)
  }

  return { baseCost: round2(baseCost), lines, skipped, warnings }
}

export function validityDays(validity: QuoteValidity): number {
  if (validity === '3') {
    return 3
  }
  if (validity === '7') {
    return 7
  }
  return 0
}

export function buildValidityText(
  validity: QuoteValidity,
  now = Date.now()
): string {
  if (validity === 'none') {
    return ''
  }
  if (validity === 'today') {
    return '仅限当天'
  }
  const days = validityDays(validity)
  const date = new Date(now + days * 24 * 60 * 60 * 1000)
  return `${days}天（${date.getMonth() + 1}月${date.getDate()}日前）`
}

export interface QuoteMessageInput {
  title: string
  note: string
  validity: QuoteValidity
  lines: QuoteLine[]
}

export function buildQuoteMessage(input: QuoteMessageInput): string {
  const blocks: string[] = []
  const title = input.title.trim()
  if (title) {
    blocks.push(`【${title}】`)
  }

  input.lines.forEach((line, index) => {
    if (input.lines.length > 1) {
      blocks.push(`${index + 1}. ${formatCNY(line.quoteCNY)}`)
    } else {
      blocks.push(`报价：${formatCNY(line.quoteCNY)}`)
    }
  })

  const validityText = buildValidityText(input.validity)
  if (validityText) {
    blocks.push(`报价有效期：${validityText}`)
  }

  const note = input.note.trim()
  if (note) {
    blocks.push(`附注：${note}`)
  }

  return blocks.join('\n')
}
