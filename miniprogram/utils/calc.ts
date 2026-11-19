import { FEE_BASIS_LABELS } from '../data/refundCompanies'
import type {
  FeeBasis,
  FeeRule,
  PayoutRounding,
  RefundCompany,
} from '../data/refundCompanies'
import { TAX_FREE_MIN_PRE_TAX_JPY } from '../data/taxConfig'

export type PriceMode = 'included' | 'excluded'
export type SettlementMode = 'refund' | 'taxFree'

export interface FeeOverride {
  pct?: number
  basis: FeeBasis
  fixedJPY?: number
  minJPY?: number
  maxJPY?: number
}

export interface CalcInput {
  price: number
  priceMode: PriceMode
  taxRatePct: number
  discountPct: number
  quantity: number
  settlementMode: SettlementMode
  company: RefundCompany
  mainFeeOverride?: FeeOverride | null
  addon?: RefundCompany | null
  includeOptionalFees: boolean
  ratePer100: number
  cardRatePer100: number
  cashbackPct: number
  extraFeeCNY: number
  useThreshold: boolean
  /** 到账核对后，用实到人民币覆盖计算 */
  actualRefundCNY?: number | null
}

export interface FeeLineResult {
  label: string
  basis: FeeBasis
  basisLabel: string
  pct?: number
  fixedJPY?: number
  amountJPY: number
  note?: string
  group: 'platform' | 'addon'
}

export interface CalcResult {
  priceInclJPY: number
  priceExclJPY: number
  paidInclJPY: number
  paidExclJPY: number
  paidJPY: number
  taxJPY: number
  quantity: number
  thresholdMet: boolean
  thresholdShortfallJPY: number
  feeLines: FeeLineResult[]
  platformFeeJPY: number
  addonFeeJPY: number
  totalFeeJPY: number
  grossRefundJPY: number
  netRefundBeforeRoundingJPY: number
  netRefundJPY: number
  roundingLossJPY: number
  refundCNY: number
  computedRefundCNY: number
  usedActualRefund: boolean
  paidCNY: number
  cashbackCNY: number
  extraFeeCNY: number
  netCostCNY: number
  perUnitCNY: number
  listCostCNY: number
  savingsCNY: number
  effectiveDiscountPct: number
  payoutRule: PayoutRounding
  warnings: string[]
  notes: string[]
}

function sanitizeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function convertPrice(
  price: number,
  priceMode: PriceMode,
  taxRatePct: number
): { incl: number; excl: number } {
  const t = clamp(sanitizeNumber(taxRatePct), 0, 100) / 100
  const safePrice = Math.max(0, sanitizeNumber(price))
  if (priceMode === 'included') {
    const incl = safePrice
    return { incl, excl: incl / (1 + t) }
  }
  const excl = safePrice
  return { incl: excl * (1 + t), excl }
}

export function roundPayout(value: number, rule: PayoutRounding): number {
  if (!(value > 0)) {
    return 0
  }
  const unit = Math.max(1, Math.round(rule.unitJPY))
  if (unit <= 1) {
    return Math.floor(value)
  }
  const units = value / unit
  const rounded = rule.mode === 'nearest' ? Math.round(units) : Math.floor(units)
  return Math.max(0, rounded * unit)
}

function feeBase(
  rule: FeeRule,
  ctx: { paidExcl: number; paidIncl: number; taxJPY: number; feesSoFar: number }
): number {
  switch (rule.basis) {
    case 'preTax':
      return ctx.paidExcl
    case 'taxIncluded':
      return ctx.paidIncl
    case 'grossRefund':
      return ctx.taxJPY
    case 'afterFees':
      return Math.max(0, ctx.taxJPY - ctx.feesSoFar)
    case 'fixed':
      return 0
    default:
      return 0
  }
}

function calcRuleAmount(
  rule: FeeRule,
  ctx: { paidExcl: number; paidIncl: number; taxJPY: number; feesSoFar: number }
): number {
  if (rule.basis === 'fixed') {
    return Math.max(0, sanitizeNumber(rule.fixedJPY || 0))
  }

  const pct = Math.max(0, sanitizeNumber(rule.pct || 0))
  const base = feeBase(rule, ctx)
  let amount = (base * pct) / 100

  if (rule.minJPY != null) {
    amount = Math.max(amount, rule.minJPY)
  }
  if (rule.maxJPY != null) {
    amount = Math.min(amount, rule.maxJPY)
  }

  return Math.max(0, amount)
}

function resolvePlatformRules(
  company: RefundCompany,
  override: FeeOverride | null | undefined,
  includeOptionalFees: boolean
): FeeRule[] {
  const baseRules = company.fees.length
    ? company.fees.slice()
    : [{ label: '手续费', pct: 0, basis: 'preTax' as FeeBasis }]

  const withOverride = override
    ? [
        {
          ...baseRules[0],
          pct: override.pct,
          basis: override.basis,
          fixedJPY: override.fixedJPY,
          minJPY: override.minJPY,
          maxJPY: override.maxJPY,
        },
        ...baseRules.slice(1),
      ]
    : baseRules

  return withOverride.filter(rule => {
    if (!rule.optional) {
      return true
    }
    return includeOptionalFees
  })
}

function makeFeeLine(
  rule: FeeRule,
  amountJPY: number,
  group: 'platform' | 'addon'
): FeeLineResult {
  return {
    label: rule.label,
    basis: rule.basis,
    basisLabel: FEE_BASIS_LABELS[rule.basis],
    pct: rule.pct,
    fixedJPY: rule.fixedJPY,
    amountJPY,
    note: rule.note,
    group,
  }
}

export function calculate(input: CalcInput): CalcResult {
  const taxRatePct = clamp(sanitizeNumber(input.taxRatePct), 0, 100)
  const discountPct = clamp(sanitizeNumber(input.discountPct), 0, 100)
  const quantity = Math.max(1, Math.floor(sanitizeNumber(input.quantity, 1)))
  const unitPrice = Math.max(0, sanitizeNumber(input.price))
  const totalPrice = unitPrice * quantity
  const ratePer100 = Math.max(0, sanitizeNumber(input.ratePer100))
  const cardRatePer100 = Math.max(0, sanitizeNumber(input.cardRatePer100))
  const cashbackPct = clamp(sanitizeNumber(input.cashbackPct), 0, 100)
  const extraFeeCNY = Math.max(0, sanitizeNumber(input.extraFeeCNY))

  const { incl, excl } = convertPrice(totalPrice, input.priceMode, taxRatePct)
  const paidIncl = incl * (1 - discountPct / 100)
  const paidExcl = paidIncl / (1 + taxRatePct / 100)
  const taxJPY = Math.max(0, paidIncl - paidExcl)
  const thresholdMet = paidExcl + 1e-9 >= TAX_FREE_MIN_PRE_TAX_JPY
  const thresholdShortfallJPY = Math.max(0, TAX_FREE_MIN_PRE_TAX_JPY - paidExcl)

  const warnings: string[] = []
  const notes: string[] = []

  if (ratePer100 <= 0) {
    warnings.push('退税汇率需大于 0。')
  }
  if (cardRatePer100 <= 0) {
    warnings.push('刷卡汇率需大于 0。')
  }
  if (discountPct >= 100) {
    warnings.push('折扣 100% 会把实付价算成 0。')
  }

  let feeLines: FeeLineResult[] = []
  let platformFeeJPY = 0
  let addonFeeJPY = 0
  let grossRefundJPY = 0
  let netRefundBeforeRoundingJPY = 0
  let netRefundJPY = 0
  let roundingLossJPY = 0
  let computedRefundCNY = 0
  let paidCNY = 0
  let cashbackCNY = 0

  if (input.settlementMode === 'taxFree') {
    paidCNY = (paidExcl * cardRatePer100) / 100
    cashbackCNY = (paidCNY * cashbackPct) / 100
    notes.push('不退税一口价：按免税价直接付款，不再计算退税。')

    if (!thresholdMet) {
      warnings.push('未达免税门槛 5,000 円（未税），一口价可能不成立。')
    }
    if (input.addon) {
      warnings.push('不退税模式不使用机场现金费，已忽略。')
    }
  } else if (input.useThreshold && !thresholdMet) {
    paidCNY = (paidIncl * cardRatePer100) / 100
    cashbackCNY = (paidCNY * cashbackPct) / 100
    warnings.push(
      `未达免税门槛：未税 ${paidExcl.toFixed(0)} 円 < 5,000 円，按不退税计算。`
    )
  } else {
    paidCNY = (paidIncl * cardRatePer100) / 100
    cashbackCNY = (paidCNY * cashbackPct) / 100
    grossRefundJPY = taxJPY

    if (grossRefundJPY > 0) {
      const platformRules = resolvePlatformRules(
        input.company,
        input.mainFeeOverride,
        input.includeOptionalFees
      )
      let feesSoFar = 0

      platformRules.forEach(rule => {
        const amount = calcRuleAmount(rule, {
          paidExcl,
          paidIncl,
          taxJPY,
          feesSoFar,
        })
        platformFeeJPY += amount
        feesSoFar += amount
        feeLines.push(makeFeeLine(rule, amount, 'platform'))
      })

      if (input.addon) {
        input.addon.fees.forEach(rule => {
          const amount = calcRuleAmount(rule, {
            paidExcl,
            paidIncl,
            taxJPY,
            feesSoFar,
          })
          addonFeeJPY += amount
          feesSoFar += amount
          feeLines.push(makeFeeLine(rule, amount, 'addon'))
        })
      }

      netRefundBeforeRoundingJPY = Math.max(0, grossRefundJPY - platformFeeJPY - addonFeeJPY)
      if (netRefundBeforeRoundingJPY <= 0) {
        warnings.push('手续费已超过退税额，退税净额为 0。')
      }

      const payoutRule: PayoutRounding =
        (input.addon && input.addon.payoutRounding) ||
        input.company.payoutRounding || { unitJPY: 1, mode: 'floor' }
      netRefundJPY = roundPayout(netRefundBeforeRoundingJPY, payoutRule)
      roundingLossJPY = Math.max(0, netRefundBeforeRoundingJPY - netRefundJPY)

      computedRefundCNY = (netRefundJPY * ratePer100) / 100
    }
  }

  const usedActualRefund =
    input.settlementMode === 'refund' &&
    input.actualRefundCNY != null &&
    Number.isFinite(input.actualRefundCNY) &&
    input.actualRefundCNY > 0

  const refundCNY = usedActualRefund
    ? (input.actualRefundCNY as number)
    : computedRefundCNY

  if (usedActualRefund) {
    notes.push('已按到账核对中的“实到人民币”重算。')
  }

  const netCostCNY = paidCNY - refundCNY - cashbackCNY + extraFeeCNY
  const perUnitCNY = netCostCNY / quantity
  const listCostCNY = (incl * cardRatePer100) / 100
  const savingsCNY = listCostCNY - netCostCNY
  const effectiveDiscountPct = listCostCNY > 0 ? (savingsCNY / listCostCNY) * 100 : 0

  if (netCostCNY < 0) {
    warnings.push('退税/返现超过实付，到手价为负，请检查输入。')
  }

  const payoutRule: PayoutRounding =
    (input.addon && input.addon.payoutRounding) ||
    input.company.payoutRounding || { unitJPY: 1, mode: 'floor' }

  return {
    priceInclJPY: incl,
    priceExclJPY: excl,
    paidInclJPY: paidIncl,
    paidExclJPY: paidExcl,
    paidJPY: input.settlementMode === 'taxFree' ? paidExcl : paidIncl,
    taxJPY,
    quantity,
    thresholdMet,
    thresholdShortfallJPY,
    feeLines,
    platformFeeJPY,
    addonFeeJPY,
    totalFeeJPY: platformFeeJPY + addonFeeJPY,
    grossRefundJPY,
    netRefundBeforeRoundingJPY,
    netRefundJPY,
    roundingLossJPY,
    refundCNY,
    computedRefundCNY,
    usedActualRefund,
    paidCNY,
    cashbackCNY,
    extraFeeCNY,
    netCostCNY,
    perUnitCNY,
    listCostCNY,
    savingsCNY,
    effectiveDiscountPct,
    payoutRule,
    warnings,
    notes,
  }
}

export interface ReconcileInput {
  refundJPY: number
  actualCNY: number
  receiptRatePer100?: number
  marketRatePer100: number
  fxLossPct?: number
}

export interface ReconcileResult {
  impliedRatePer100: number | null
  marketExpectedCNY: number | null
  hiddenLossCNY: number | null
  hiddenLossPct: number | null
  receiptExpectedCNY: number | null
  receiptDiffCNY: number | null
  referenceExpectedCNY: number | null
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const refundJPY = Math.max(0, sanitizeNumber(input.refundJPY))
  const actualCNY = Math.max(0, sanitizeNumber(input.actualCNY))
  const marketRate = Math.max(0, sanitizeNumber(input.marketRatePer100))
  const receiptRate = Math.max(0, sanitizeNumber(input.receiptRatePer100 || 0))
  const fxLossPct = Math.max(0, sanitizeNumber(input.fxLossPct || 0))

  const impliedRatePer100 = refundJPY > 0 && actualCNY > 0
    ? (actualCNY / refundJPY) * 100
    : null
  const marketExpectedCNY = refundJPY > 0 && marketRate > 0
    ? (refundJPY * marketRate) / 100
    : null
  const hiddenLossCNY =
    marketExpectedCNY != null && actualCNY > 0
      ? marketExpectedCNY - actualCNY
      : null
  const hiddenLossPct =
    hiddenLossCNY != null && marketExpectedCNY != null && marketExpectedCNY > 0
      ? (hiddenLossCNY / marketExpectedCNY) * 100
      : null
  const receiptExpectedCNY =
    refundJPY > 0 && receiptRate > 0
      ? (refundJPY * receiptRate) / 100
      : null
  const receiptDiffCNY =
    receiptExpectedCNY != null && actualCNY > 0
      ? actualCNY - receiptExpectedCNY
      : null
  const referenceExpectedCNY =
    refundJPY > 0 && marketRate > 0
      ? ((refundJPY * marketRate) / 100) * (1 - fxLossPct / 100)
      : null

  return {
    impliedRatePer100,
    marketExpectedCNY,
    hiddenLossCNY,
    hiddenLossPct,
    receiptExpectedCNY,
    receiptDiffCNY,
    referenceExpectedCNY,
  }
}
