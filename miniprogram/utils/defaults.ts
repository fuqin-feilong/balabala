import { getAddonById, getCompanyById } from '../data/refundCompanies'
import type { FeeBasis } from '../data/refundCompanies'
import { DEFAULT_RATE_PER_100 } from '../data/taxConfig'
import type { PriceMode, SettlementMode } from './calc'
import { parseNumber } from './format'
import { uniqueNumbers } from './quote'
import type {
  QuoteBasis,
  QuoteMode,
  QuoteRounding,
  QuoteValidity,
} from './quote'
import { DEFAULTS_KEY } from './storage'

export interface DefaultSettings {
  /** 计算器默认参数 */
  priceMode: PriceMode
  taxRatePct: number
  settlementMode: SettlementMode
  companyId: string
  presetId: string
  addonId: string
  feeCustom: boolean
  feePct: string
  feeBasis: FeeBasis
  feeIsFixed: boolean
  feeFixedJPY: string
  feeMinJPY: string
  includeOptionalFees: boolean
  discountPct: number
  cashbackPct: number
  extraFeeCNY: string
  ratePer100: string
  fxLossPct: string

  /** 报价页默认偏好 */
  quoteMode: QuoteMode
  quoteProfitPcts: number[]
  quoteFixedAdds: number[]
  quoteBasis: QuoteBasis
  quoteFloorPct: number
  quoteRounding: QuoteRounding
  quoteValidity: QuoteValidity
}

export const SYSTEM_DEFAULTS: DefaultSettings = {
  priceMode: 'included',
  taxRatePct: 10,
  settlementMode: 'refund',
  companyId: 'global-blue',
  presetId: 'default',
  addonId: 'none',
  feeCustom: false,
  feePct: '2.3',
  feeBasis: 'preTax',
  feeIsFixed: false,
  feeFixedJPY: '',
  feeMinJPY: '',
  includeOptionalFees: true,
  discountPct: 0,
  cashbackPct: 0,
  extraFeeCNY: '0',
  ratePer100: String(DEFAULT_RATE_PER_100),
  fxLossPct: '4',
  quoteMode: 'both',
  quoteProfitPcts: [10, 20],
  quoteFixedAdds: [50, 100],
  quoteBasis: 'costPlus',
  quoteFloorPct: 10,
  quoteRounding: 0,
  quoteValidity: '7',
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function normalizeString(value: unknown, fallback: string): string {
  if (value == null) {
    return fallback
  }
  const text = String(value).trim()
  return text ? text : fallback
}

const FEE_BASIS_VALUES = ['preTax', 'taxIncluded', 'grossRefund', 'afterFees']

function normalizeFeeBasis(value: unknown, fallback: FeeBasis): FeeBasis {
  if (value === 'fixed') {
    return 'fixed'
  }
  return FEE_BASIS_VALUES.indexOf(String(value)) >= 0
    ? (value as FeeBasis)
    : fallback
}

function normalizeQuoteMode(value: unknown): QuoteMode {
  if (value === 'pct' || value === 'fixed' || value === 'both') {
    return value
  }
  return SYSTEM_DEFAULTS.quoteMode
}

function normalizeQuoteBasis(value: unknown): QuoteBasis {
  return value === 'margin' ? 'margin' : 'costPlus'
}

function normalizeQuoteRounding(value: unknown): QuoteRounding {
  const number = Number(value)
  if (number === 10 || number === 50 || number === 100) {
    return number
  }
  return 0
}

function normalizeQuoteValidity(value: unknown): QuoteValidity {
  if (value === 'none' || value === 'today' || value === '3' || value === '7') {
    return value
  }
  return SYSTEM_DEFAULTS.quoteValidity
}

export function normalizeDefaults(raw: Partial<DefaultSettings>): DefaultSettings {
  const merged = { ...SYSTEM_DEFAULTS, ...raw }
  if (!getCompanyById(merged.companyId)) {
    merged.companyId = SYSTEM_DEFAULTS.companyId
  }
  if (merged.addonId !== 'none' && !getAddonById(merged.addonId)) {
    merged.addonId = 'none'
  }
  merged.priceMode = merged.priceMode === 'excluded' ? 'excluded' : 'included'
  merged.taxRatePct = merged.taxRatePct === 8 ? 8 : 10
  merged.settlementMode =
    merged.settlementMode === 'taxFree' ? 'taxFree' : 'refund'
  merged.presetId = normalizeString(merged.presetId, 'default')
  merged.feeCustom = Boolean(merged.feeCustom)
  merged.feePct = normalizeString(merged.feePct, '0')
  merged.feeBasis = normalizeFeeBasis(merged.feeBasis, 'preTax')
  merged.feeIsFixed = Boolean(merged.feeIsFixed)
  merged.feeFixedJPY = normalizeString(merged.feeFixedJPY, '')
  merged.feeMinJPY = normalizeString(merged.feeMinJPY, '')
  merged.includeOptionalFees = merged.includeOptionalFees !== false
  merged.discountPct = clamp(parseNumber(merged.discountPct), 0, 100)
  merged.cashbackPct = clamp(parseNumber(merged.cashbackPct), 0, 100)
  merged.extraFeeCNY = normalizeString(merged.extraFeeCNY, '0')
  const defaultRate = parseNumber(merged.ratePer100)
  merged.ratePer100 = String(
    defaultRate > 0 ? defaultRate : DEFAULT_RATE_PER_100
  )
  merged.fxLossPct = String(clamp(parseNumber(merged.fxLossPct), 0, 100))

  merged.quoteMode = normalizeQuoteMode(merged.quoteMode)
  const pcts = uniqueNumbers(
    Array.isArray(merged.quoteProfitPcts)
      ? merged.quoteProfitPcts
      : SYSTEM_DEFAULTS.quoteProfitPcts
  )
  merged.quoteProfitPcts = pcts.length
    ? pcts
    : SYSTEM_DEFAULTS.quoteProfitPcts.slice()
  const adds = uniqueNumbers(
    Array.isArray(merged.quoteFixedAdds)
      ? merged.quoteFixedAdds
      : SYSTEM_DEFAULTS.quoteFixedAdds
  )
  merged.quoteFixedAdds = adds.length
    ? adds
    : SYSTEM_DEFAULTS.quoteFixedAdds.slice()
  merged.quoteBasis = normalizeQuoteBasis(merged.quoteBasis)
  merged.quoteFloorPct = clamp(parseNumber(merged.quoteFloorPct), 0, 99)
  merged.quoteRounding = normalizeQuoteRounding(merged.quoteRounding)
  merged.quoteValidity = normalizeQuoteValidity(merged.quoteValidity)

  return merged
}

export function loadDefaults(): DefaultSettings {
  try {
    const saved = wx.getStorageSync(DEFAULTS_KEY)
    if (!saved || typeof saved !== 'object') {
      return normalizeDefaults({})
    }
    return normalizeDefaults(saved as Partial<DefaultSettings>)
  } catch (error) {
    return normalizeDefaults({})
  }
}

export function saveDefaults(settings: Partial<DefaultSettings>): DefaultSettings {
  const normalized = normalizeDefaults(settings)
  try {
    wx.setStorageSync(DEFAULTS_KEY, normalized)
  } catch (error) {
    // ignore
  }
  return normalized
}

export function clearDefaults(): void {
  try {
    wx.removeStorageSync(DEFAULTS_KEY)
  } catch (error) {
    // ignore
  }
}

/**
 * 冷启动时覆盖计算器参数，保留价格、数量、对账字段等临时输入。
 */
export function paramFieldsFromDefaults(
  defaults: DefaultSettings
): Record<string, unknown> {
  let feePct = defaults.feePct
  let feeBasis = defaults.feeBasis
  let feeIsFixed = defaults.feeIsFixed
  let feeFixedJPY = defaults.feeFixedJPY
  let feeMinJPY = defaults.feeMinJPY

  if (!defaults.feeCustom) {
    const company = getCompanyById(defaults.companyId)
    const fee = company ? company.fees[0] : null
    if (fee) {
      feePct = String(fee.pct || 0)
      feeBasis = fee.basis
      feeIsFixed = fee.basis === 'fixed'
      feeFixedJPY = fee.fixedJPY ? String(fee.fixedJPY) : ''
      feeMinJPY = fee.minJPY ? String(fee.minJPY) : ''
    }
  }

  return {
    priceMode: defaults.priceMode,
    taxRatePct: defaults.taxRatePct,
    settlementMode: defaults.settlementMode,
    companyId: defaults.companyId,
    presetId: defaults.presetId,
    addonId: defaults.addonId,
    feeCustom: defaults.feeCustom,
    feePct,
    feeBasis,
    feeIsFixed,
    feeFixedJPY,
    feeMinJPY,
    includeOptionalFees: defaults.includeOptionalFees,
    discountPct: defaults.discountPct,
    cashbackPct: defaults.cashbackPct,
    extraFeeCNY: defaults.extraFeeCNY,
    ratePer100: defaults.ratePer100,
    marketRatePer100: defaults.ratePer100,
    cardRatePer100: defaults.ratePer100,
    rateSource: 'default',
    rateUpdatedAt: 0,
    fxLossPct: defaults.fxLossPct,
  }
}

/**
 * 把计算器当前参数保存为用户默认值；报价偏好沿用原有默认。
 */
export function defaultsFromForm(
  form: Record<string, unknown>,
  base: DefaultSettings
): DefaultSettings {
  return normalizeDefaults({
    ...base,
    priceMode: form.priceMode as PriceMode,
    taxRatePct: Number(form.taxRatePct),
    settlementMode: form.settlementMode as SettlementMode,
    companyId: String(form.companyId || base.companyId),
    presetId: String(form.presetId || base.presetId),
    addonId: String(form.addonId || base.addonId),
    feeCustom: Boolean(form.feeCustom),
    feePct: String(form.feePct == null ? base.feePct : form.feePct),
    feeBasis: form.feeBasis as FeeBasis,
    feeIsFixed: Boolean(form.feeIsFixed),
    feeFixedJPY: String(
      form.feeFixedJPY == null ? base.feeFixedJPY : form.feeFixedJPY
    ),
    feeMinJPY: String(form.feeMinJPY == null ? base.feeMinJPY : form.feeMinJPY),
    includeOptionalFees: form.includeOptionalFees !== false,
    discountPct: Number(form.discountPct),
    cashbackPct: Number(form.cashbackPct),
    extraFeeCNY: String(
      form.extraFeeCNY == null ? base.extraFeeCNY : form.extraFeeCNY
    ),
    ratePer100: String(
      form.ratePer100 == null ? base.ratePer100 : form.ratePer100
    ),
    fxLossPct: String(form.fxLossPct == null ? base.fxLossPct : form.fxLossPct),
  })
}

export function quotePrefsFromDefaults(defaults: DefaultSettings) {
  return {
    mode: defaults.quoteMode,
    profitPcts: defaults.quoteProfitPcts.slice(),
    fixedAdds: defaults.quoteFixedAdds.slice(),
    basis: defaults.quoteBasis,
    floorPct: defaults.quoteFloorPct,
    rounding: defaults.quoteRounding,
    validity: defaults.quoteValidity,
  }
}
