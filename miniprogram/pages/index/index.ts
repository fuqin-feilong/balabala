import {
  AIRPORT_ADDONS,
  CONFIDENCE_LABELS,
  FEE_BASIS_LABELS,
  REFUND_COMPANIES,
  getAddonById,
  getCompanyById,
} from '../../data/refundCompanies'
import type { FeeBasis, RefundCompany } from '../../data/refundCompanies'
import {
  ALIPAY_SPREAD_PCT,
  CASHBACK_OPTIONS,
  DATA_VERSION,
  DEFAULT_RATE_PER_100,
  DISCOUNT_OPTIONS,
  MAX_QUANTITY,
  RATE_SOURCE_LABELS,
  TAX_FREE_MIN_PRE_TAX_JPY,
  TAX_RATE_OPTIONS,
} from '../../data/taxConfig'
import { calculate, reconcile } from '../../utils/calc'
import type {
  CalcInput,
  CalcResult,
  PriceMode,
  ReconcileResult,
  SettlementMode,
} from '../../utils/calc'
import {
  formatCNY,
  formatNumber,
  formatPct,
  formatPctValue,
  formatRate,
  formatShortTime,
  formatYen,
  parseNumber,
} from '../../utils/format'
import {
  consumeReset,
  consumeRestore,
  isResetPending,
  isRestorePending,
  loadForm,
  saveForm,
} from '../../utils/storage'
import { addOrder } from '../../services/orders'
import type { OrderResultSnapshot } from '../../services/orders'
import { fetchMarketRate } from '../../services/exchangeRate'

interface FormState {
  price: string
  priceMode: PriceMode
  taxRatePct: number
  discountPct: number
  quantity: number
  settlementMode: SettlementMode
  companyId: string
  presetId: string
  addonId: string
  feePct: string
  feeBasis: FeeBasis
  feeIsFixed: boolean
  feeFixedJPY: string
  feeMinJPY: string
  feeCustom: boolean
  includeOptionalFees: boolean
  ratePer100: string
  marketRatePer100: string
  cardRatePer100: string
  rateSource: string
  rateUpdatedAt: number
  cashbackPct: number
  extraFeeCNY: string
  actualRefundJPY: string
  actualReceivedCNY: string
  receiptRate: string
  fxLossPct: string
  useActual: boolean
}

interface CompanyChip {
  id: string
  name: string
}

interface PresetChip {
  id: string
  name: string
}

interface FeeLineView {
  key: string
  label: string
  amountText: string
  basisText: string
  note: string
  group: 'platform' | 'addon'
}

interface ResultView {
  netCostText: string
  perUnitText: string
  showPerUnit: boolean
  paidText: string
  refundText: string
  cashbackText: string
  feeText: string
  savingsText: string
  effectiveDiscountText: string
  taxText: string
  grossRefundText: string
  netRefundText: string
  roundingLossText: string
  showRoundingLoss: boolean
  listCostText: string
  thresholdText: string
  settlementLabel: string
  rateText: string
  actualBadge: boolean
}

interface ReconcileView {
  marketExpectedText: string
  impliedRateText: string
  hiddenLossText: string
  hiddenPctText: string
  receiptDiffText: string
  referenceText: string
  statusText: string
  statusClass: string
}

const DEFAULT_FORM: FormState = {
  price: '',
  priceMode: 'included',
  taxRatePct: 10,
  discountPct: 0,
  quantity: 1,
  settlementMode: 'refund',
  companyId: 'global-blue',
  presetId: 'default',
  addonId: 'none',
  feePct: '2.3',
  feeBasis: 'preTax',
  feeIsFixed: false,
  feeFixedJPY: '',
  feeMinJPY: '',
  feeCustom: false,
  includeOptionalFees: true,
  ratePer100: String(DEFAULT_RATE_PER_100),
  marketRatePer100: String(DEFAULT_RATE_PER_100),
  cardRatePer100: String(DEFAULT_RATE_PER_100),
  rateSource: 'default',
  rateUpdatedAt: 0,
  cashbackPct: 0,
  extraFeeCNY: '0',
  actualRefundJPY: '',
  actualReceivedCNY: '',
  receiptRate: '',
  fxLossPct: '4',
  useActual: false,
}

function normalizeForm(raw: FormState): FormState {
  const form: FormState = { ...DEFAULT_FORM, ...raw }
  if (!getCompanyById(form.companyId)) {
    form.companyId = DEFAULT_FORM.companyId
  }
  if (form.addonId !== 'none' && !getAddonById(form.addonId)) {
    form.addonId = 'none'
  }
  if (!form.feeBasis) {
    form.feeBasis = 'preTax'
  }
  form.quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(parseNumber(form.quantity) || 1)))
  form.taxRatePct = form.taxRatePct === 8 ? 8 : 10
  form.rateUpdatedAt = parseNumber(form.rateUpdatedAt)
  return form
}

function mainFeeOfCompany(company: RefundCompany) {
  return company.fees[0] || { label: '手续费', pct: 0, basis: 'preTax' as FeeBasis }
}

function confidenceClass(confidence: RefundCompany['confidence']): string {
  if (confidence === 'official') {
    return 'confidence-official'
  }
  if (confidence === 'measured') {
    return 'confidence-measured'
  }
  return 'confidence-estimate'
}

Page({
  data: {
    form: DEFAULT_FORM,
    companies: [] as CompanyChip[],
    addons: [] as CompanyChip[],
    storePresets: [] as PresetChip[],
    selectedCompanyName: '',
    companyDescription: '',
    companySourceNote: '',
    confidenceLabel: '',
    confidenceClass: '',
    verifiedAt: '',
    feeBasisLabel: '',
    feeBasisClass: '',
    feeExtraText: '',
    headerSummary: '',
    rateDisplay: '',
    marketRateDisplay: '',
    alipayRateDisplay: '',
    rateSourceLabel: '',
    rateUpdatedText: '',
    thresholdHint: '',
    presetNote: '',
    isManualCompany: false,
    canResetFee: false,
    hasOptionalFee: false,
    refundOpen: true,
    reconcileOpen: false,
    feeAdvancedOpen: false,
    hasResult: false,
    result: null as ResultView | null,
    feeLines: [] as FeeLineView[],
    warnings: [] as string[],
    notes: [] as string[],
    reconcileView: null as ReconcileView | null,
    taxRates: TAX_RATE_OPTIONS,
    discountOptions: DISCOUNT_OPTIONS,
    cashbackOptions: CASHBACK_OPTIONS,
    dataVersion: DATA_VERSION,
  },

  onLoad() {
    const form = normalizeForm(loadForm(DEFAULT_FORM))
    this.setData(
      {
        form,
        companies: REFUND_COMPANIES.map(company => ({ id: company.id, name: company.name })),
        addons: [
          { id: 'none', name: '不用机场现金' },
          ...AIRPORT_ADDONS.map(addon => ({ id: addon.id, name: addon.name })),
        ],
      },
      () => this.recalculate()
    )
  },

  onShow() {
    if (consumeReset()) {
      this.setData({ form: DEFAULT_FORM }, () => {
        this.recalculate()
        wx.showToast({ title: '已恢复默认', icon: 'none' })
      })
      return
    }
    if (!consumeRestore()) {
      return
    }
    const form = normalizeForm(loadForm(DEFAULT_FORM))
    this.setData({ form }, () => {
      this.recalculate()
      wx.showToast({ title: '已载入历史单', icon: 'none' })
    })
  },

  onHide() {
    if (!isResetPending() && !isRestorePending()) {
      saveForm(this.data.form as unknown as Record<string, unknown>)
    }
  },

  onUnload() {
    if (!isResetPending() && !isRestorePending()) {
      saveForm(this.data.form as unknown as Record<string, unknown>)
    }
  },

  recalculate() {
    const form = this.data.form
    const company = getCompanyById(form.companyId) || REFUND_COMPANIES[0]
    const addon = form.addonId !== 'none' ? getAddonById(form.addonId) || null : null
    const selectorView = this.buildSelectorView(form, company, addon)

    const price = parseNumber(form.price)
    const reconcileView = this.buildReconcileView(form)

    if (price <= 0) {
      this.setData({
        ...selectorView,
        hasResult: false,
        result: null,
        feeLines: [],
        warnings: [],
        notes: [],
        reconcileView,
      })
      return
    }

    const input: CalcInput = {
      price,
      priceMode: form.priceMode,
      taxRatePct: form.taxRatePct,
      discountPct: form.discountPct,
      quantity: form.quantity,
      settlementMode: form.settlementMode,
      company,
      mainFeeOverride: this.buildFeeOverride(form, company),
      addon,
      includeOptionalFees: form.includeOptionalFees,
      ratePer100: parseNumber(form.ratePer100),
      cardRatePer100: parseNumber(form.cardRatePer100),
      cashbackPct: form.cashbackPct,
      extraFeeCNY: parseNumber(form.extraFeeCNY),
      useThreshold: true,
      actualRefundCNY:
        form.useActual && parseNumber(form.actualReceivedCNY) > 0
          ? parseNumber(form.actualReceivedCNY)
          : null,
    }

    const calculated = calculate(input)
    const result = this.buildResultView(calculated, form)
    const feeLines = calculated.feeLines.map((line, index) => ({
      key: `${line.group}_${line.label}_${index}`,
      label: line.label,
      amountText: `${formatYen(line.amountJPY)} 円`,
      basisText:
        line.basis === 'fixed'
          ? '定额收费'
          : `${line.basisLabel} · ${formatPct(line.pct || 0)}`,
      note: line.note || '',
      group: line.group,
    }))

    this.setData({
      ...selectorView,
      hasResult: true,
      result,
      feeLines,
      warnings: calculated.warnings,
      notes: calculated.notes,
      reconcileView,
    })
  },

  buildSelectorView(
    form: FormState,
    company: RefundCompany,
    addon: RefundCompany | null
  ) {
    const rate = parseNumber(form.ratePer100)
    const marketRate = parseNumber(form.marketRatePer100)
    const optionalFee = company.fees.find(rule => rule.optional)
    const optionalFeeText = optionalFee
      ? form.includeOptionalFees
        ? `含提现费 ${formatPct(optionalFee.pct || 0)}`
        : '未含提现费'
      : ''
    const feeExtraParts = [optionalFeeText].filter(Boolean)
    const settlementLabel =
      form.settlementMode === 'refund' ? '出境退税' : '不退税一口价'
    const timeText = form.rateUpdatedAt ? formatShortTime(form.rateUpdatedAt) : ''
    const headerTimeText =
      form.rateSource === 'manual' || form.rateSource === 'alipay' ? '' : timeText

    const presets: PresetChip[] = [
      { id: 'default', name: '公司默认' },
      ...(company.storePresets || [])
        .filter(preset => preset.id !== 'default')
        .map(preset => ({ id: preset.id, name: preset.name })),
    ]
    const selectedPreset = (company.storePresets || []).find(
      preset => preset.id === form.presetId
    )

    const thresholdIncl = TAX_FREE_MIN_PRE_TAX_JPY * (1 + form.taxRatePct / 100)
    const headerFeeText = form.feeIsFixed
      ? `定额 ${formatYen(parseNumber(form.feeFixedJPY))} 円`
      : `${formatPctValue(parseNumber(form.feePct))}%`

    return {
      storePresets: presets,
      selectedCompanyName: company.name,
      companyDescription: company.description,
      companySourceNote: company.sourceNote,
      confidenceLabel:
        company.kind === 'manual'
          ? '自定义'
          : CONFIDENCE_LABELS[company.confidence],
      confidenceClass: confidenceClass(company.confidence),
      verifiedAt: company.verifiedAt,
      feeBasisLabel: form.feeIsFixed
        ? '定额收费'
        : FEE_BASIS_LABELS[form.feeBasis] || FEE_BASIS_LABELS.preTax,
      feeBasisClass: form.feeIsFixed
        ? 'basis-violet'
        : form.feeBasis === 'grossRefund'
        ? 'basis-coral'
        : form.feeBasis === 'taxIncluded'
        ? 'basis-blue'
        : 'basis-amber',
      feeExtraText: feeExtraParts.join(' · '),
      headerSummary: `${settlementLabel} · ${company.name}${
        form.settlementMode === 'refund' && addon ? ` + ${addon.name}` : ''
      } · ${headerFeeText} · 汇率 ${formatRate(rate)}${
        headerTimeText ? ` · ${headerTimeText}` : ''
      }`,
      rateDisplay: formatRate(rate),
      marketRateDisplay: formatRate(marketRate),
      alipayRateDisplay: formatRate(marketRate * (1 + ALIPAY_SPREAD_PCT / 100)),
      rateSourceLabel: RATE_SOURCE_LABELS[form.rateSource] || '手填',
      rateUpdatedText:
        form.rateSource === 'manual'
          ? '未同步市场价'
          : form.rateSource === 'alipay'
          ? '按市场价估算'
          : timeText
          ? `${timeText} 更新`
          : '未同步',
      thresholdHint: `免税门槛：未税 ${formatYen(
        TAX_FREE_MIN_PRE_TAX_JPY
      )} 円（${form.taxRatePct}% 商品含税约 ${formatYen(thresholdIncl)} 円）`,
      presetNote: selectedPreset?.note || '',
      isManualCompany: company.kind === 'manual',
      canResetFee: form.feeCustom || form.presetId !== 'default',
      hasOptionalFee: company.fees.some(rule => rule.optional),
    }
  },

  buildFeeOverride(form: FormState, company: RefundCompany) {
    if (!form.feeCustom && !form.feeIsFixed && company.kind !== 'manual') {
      return null
    }
    if (form.feeIsFixed) {
      return {
        pct: 0,
        basis: 'fixed' as FeeBasis,
        fixedJPY: parseNumber(form.feeFixedJPY),
      }
    }
    const minJPY = parseNumber(form.feeMinJPY)
    return {
      pct: parseNumber(form.feePct),
      basis: form.feeBasis,
      minJPY: minJPY > 0 ? minJPY : undefined,
    }
  },

  buildResultView(calculated: CalcResult, form: FormState): ResultView {
    const settlementLabel =
      form.settlementMode === 'refund' ? '出境退税' : '不退税一口价'
    return {
      netCostText: formatCNY(calculated.netCostCNY),
      perUnitText: formatCNY(calculated.perUnitCNY),
      showPerUnit: calculated.quantity > 1,
      paidText: formatCNY(calculated.paidCNY),
      refundText: `${formatCNY(calculated.refundCNY)}${
        calculated.usedActualRefund ? '（实到）' : ''
      }`,
      cashbackText: formatCNY(calculated.cashbackCNY),
      feeText: `${formatYen(calculated.totalFeeJPY)} 円`,
      savingsText: formatCNY(calculated.savingsCNY),
      effectiveDiscountText: formatPct(calculated.effectiveDiscountPct),
      taxText: `${formatYen(calculated.taxJPY)} 円`,
      grossRefundText: `${formatYen(calculated.grossRefundJPY)} 円`,
      netRefundText: `${formatYen(calculated.netRefundJPY)} 円`,
      roundingLossText: `${formatYen(calculated.roundingLossJPY)} 円`,
      showRoundingLoss: calculated.roundingLossJPY >= 1,
      listCostText: formatCNY(calculated.listCostCNY),
      thresholdText: calculated.thresholdMet
        ? '已达 5,000 円未税门槛'
        : `还差 ${formatYen(calculated.thresholdShortfallJPY)} 円未税`,
      settlementLabel,
      rateText: formatRate(
        parseNumber(
          form.settlementMode === 'taxFree'
            ? form.cardRatePer100
            : form.ratePer100
        )
      ),
      actualBadge: calculated.usedActualRefund,
    }
  },

  buildReconcileView(form: FormState): ReconcileView | null {
    const refundJPY = parseNumber(form.actualRefundJPY)
    const actualCNY = parseNumber(form.actualReceivedCNY)
    const receiptRate = parseNumber(form.receiptRate)
    if (refundJPY <= 0 && actualCNY <= 0 && receiptRate <= 0) {
      return null
    }

    const reconciled: ReconcileResult = reconcile({
      refundJPY,
      actualCNY,
      receiptRatePer100: receiptRate,
      marketRatePer100: parseNumber(form.marketRatePer100),
      fxLossPct: parseNumber(form.fxLossPct),
    })

    const hiddenPct = reconciled.hiddenLossPct
    let statusText = '等待实到金额'
    let statusClass = 'reconcile-neutral'
    if (hiddenPct != null) {
      if (hiddenPct > 0.05) {
        statusText = `被吃 ${formatPct(hiddenPct)}`
        statusClass = 'reconcile-warn'
      } else if (hiddenPct < -0.05) {
        statusText = `比市场价高 ${formatPct(Math.abs(hiddenPct))}`
        statusClass = 'reconcile-good'
      } else {
        statusText = '基本持平'
        statusClass = 'reconcile-good'
      }
    }

    return {
      marketExpectedText:
        reconciled.marketExpectedCNY != null
          ? formatCNY(reconciled.marketExpectedCNY)
          : '—',
      impliedRateText:
        reconciled.impliedRatePer100 != null
          ? `${formatRate(reconciled.impliedRatePer100)} 元/100日元`
          : '—',
      hiddenLossText:
        reconciled.hiddenLossCNY != null
          ? formatCNY(reconciled.hiddenLossCNY)
          : '—',
      hiddenPctText: hiddenPct != null ? formatPct(hiddenPct) : '—',
      receiptDiffText:
        reconciled.receiptDiffCNY != null
          ? formatCNY(reconciled.receiptDiffCNY)
          : '—',
      referenceText:
        reconciled.referenceExpectedCNY != null
          ? formatCNY(reconciled.referenceExpectedCNY)
          : '—',
      statusText,
      statusClass,
    }
  },

  onQuickPrice(e: WechatMiniprogram.TouchEvent) {
    const value = String(e.currentTarget.dataset.value || '')
    this.setData({ 'form.price': value }, () => this.recalculate())
  },

  onFieldInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData(
      { [`form.${field}`]: e.detail.value } as unknown as Record<string, unknown>,
      () => this.recalculate()
    )
  },

  onDiscountInput(e: WechatMiniprogram.Input) {
    const value = Math.min(100, Math.max(0, parseNumber(e.detail.value)))
    this.setData({ 'form.discountPct': value }, () => this.recalculate())
  },

  onCashbackInput(e: WechatMiniprogram.Input) {
    const value = Math.min(100, Math.max(0, parseNumber(e.detail.value)))
    this.setData({ 'form.cashbackPct': value }, () => this.recalculate())
  },

  onNumberChipTap(e: WechatMiniprogram.TouchEvent) {
    const field = e.currentTarget.dataset.field as
      | 'taxRatePct'
      | 'discountPct'
      | 'cashbackPct'
    const value = Number(e.currentTarget.dataset.value)
    this.setData({ [`form.${field}`]: value } as unknown as Record<string, unknown>, () =>
      this.recalculate()
    )
  },

  onOptionTap(e: WechatMiniprogram.TouchEvent) {
    const field = e.currentTarget.dataset.field as 'priceMode' | 'settlementMode'
    const value = e.currentTarget.dataset.value as string
    this.setData({ [`form.${field}`]: value } as unknown as Record<string, unknown>, () =>
      this.recalculate()
    )
  },

  onCompanyTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const company = getCompanyById(id)
    if (!company) {
      return
    }
    const mainFee = mainFeeOfCompany(company)
    this.setData(
      {
        'form.companyId': id,
        'form.presetId': 'default',
        'form.feePct': String(mainFee.pct || 0),
        'form.feeBasis': mainFee.basis,
        'form.feeIsFixed': mainFee.basis === 'fixed',
        'form.feeFixedJPY': mainFee.fixedJPY ? String(mainFee.fixedJPY) : '',
        'form.feeMinJPY': mainFee.minJPY ? String(mainFee.minJPY) : '',
        'form.feeCustom': company.kind === 'manual',
        'form.includeOptionalFees': true,
      },
      () => this.recalculate()
    )
  },

  onPresetTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const form = this.data.form
    const company = getCompanyById(form.companyId)
    if (!company) {
      return
    }
    if (id === 'default') {
      this.resetFeeToCompany(company)
      return
    }
    const preset = (company.storePresets || []).find(item => item.id === id)
    if (!preset) {
      return
    }
    this.setData(
      {
        'form.presetId': preset.id,
        'form.feeCustom': true,
        'form.feePct': String(preset.feePct),
        'form.feeBasis': preset.feeBasis,
        'form.feeIsFixed': Boolean(preset.fixedJPY),
        'form.feeFixedJPY': preset.fixedJPY ? String(preset.fixedJPY) : '',
        'form.feeMinJPY': preset.minJPY ? String(preset.minJPY) : '',
      },
      () => this.recalculate()
    )
  },

  resetFeeToCompany(company: RefundCompany) {
    const mainFee = mainFeeOfCompany(company)
    this.setData(
      {
        'form.presetId': 'default',
        'form.feeCustom': company.kind === 'manual',
        'form.feePct': String(mainFee.pct || 0),
        'form.feeBasis': mainFee.basis,
        'form.feeIsFixed': mainFee.basis === 'fixed',
        'form.feeFixedJPY': mainFee.fixedJPY ? String(mainFee.fixedJPY) : '',
        'form.feeMinJPY': mainFee.minJPY ? String(mainFee.minJPY) : '',
        'form.includeOptionalFees': true,
      },
      () => this.recalculate()
    )
  },

  onFeeReset() {
    const company = getCompanyById(this.data.form.companyId)
    if (company) {
      this.resetFeeToCompany(company)
    }
  },

  onFeePctInput(e: WechatMiniprogram.Input) {
    this.setData(
      {
        'form.feePct': e.detail.value,
        'form.feeCustom': true,
        'form.presetId': 'custom',
      },
      () => this.recalculate()
    )
  },

  onFeeAdvancedInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string
    this.setData(
      {
        [`form.${field}`]: e.detail.value,
        'form.feeCustom': true,
        'form.presetId': 'custom',
      } as unknown as Record<string, unknown>,
      () => this.recalculate()
    )
  },

  onFeeBasisTap(e: WechatMiniprogram.TouchEvent) {
    const basis = e.currentTarget.dataset.value as FeeBasis
    this.setData(
      {
        'form.feeBasis': basis,
        'form.feeIsFixed': false,
        'form.feeCustom': true,
        'form.presetId': 'custom',
      },
      () => this.recalculate()
    )
  },

  onFeeFixedChange(e: WechatMiniprogram.SwitchChange) {
    const checked = e.detail.value
    this.setData(
      {
        'form.feeIsFixed': checked,
        'form.feeCustom': true,
        'form.presetId': 'custom',
      },
      () => this.recalculate()
    )
  },

  onOptionalFeeChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ 'form.includeOptionalFees': e.detail.value }, () =>
      this.recalculate()
    )
  },

  onAddonTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    this.setData({ 'form.addonId': id }, () => this.recalculate())
  },

  onQuantityMinus() {
    const next = Math.max(1, this.data.form.quantity - 1)
    this.setData({ 'form.quantity': next }, () => this.recalculate())
  },

  onQuantityPlus() {
    const next = Math.min(MAX_QUANTITY, this.data.form.quantity + 1)
    this.setData({ 'form.quantity': next }, () => this.recalculate())
  },

  onRateInput(e: WechatMiniprogram.Input) {
    this.setData(
      {
        'form.ratePer100': e.detail.value,
        'form.rateSource': 'manual',
      },
      () => this.recalculate()
    )
  },

  onCardRateInput(e: WechatMiniprogram.Input) {
    this.setData({ 'form.cardRatePer100': e.detail.value }, () =>
      this.recalculate()
    )
  },

  onExtraFeeInput(e: WechatMiniprogram.Input) {
    this.setData({ 'form.extraFeeCNY': e.detail.value }, () =>
      this.recalculate()
    )
  },

  applyMarketRate() {
    this.setData(
      {
        'form.ratePer100': this.data.form.marketRatePer100,
        'form.cardRatePer100': this.data.form.marketRatePer100,
        'form.rateSource': 'market',
      },
      () => this.recalculate()
    )
  },

  applyAlipayRate() {
    const market = parseNumber(this.data.form.marketRatePer100)
    const rate = market * (1 + ALIPAY_SPREAD_PCT / 100)
    this.setData(
      {
        'form.ratePer100': rate.toFixed(4),
        'form.rateSource': 'alipay',
      },
      () => this.recalculate()
    )
  },

  onSyncRate() {
    wx.showLoading({ title: '同步汇率…' })
    fetchMarketRate()
      .then(result => {
        this.setData(
          {
            'form.marketRatePer100': result.ratePer100.toFixed(4),
            'form.ratePer100': result.ratePer100.toFixed(4),
            'form.cardRatePer100': result.ratePer100.toFixed(4),
            'form.rateSource': result.cached ? 'cache' : 'market',
            'form.rateUpdatedAt': result.updatedAt,
          },
          () => this.recalculate()
        )
        wx.hideLoading()
        wx.showToast({
          title: result.cached ? '使用缓存汇率' : '汇率已同步',
          icon: 'none',
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '同步失败，请手填', icon: 'none' })
      })
  },

  onUseActualChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ 'form.useActual': e.detail.value }, () =>
      this.recalculate()
    )
  },

  toggleRefund() {
    this.setData({ refundOpen: !this.data.refundOpen })
  },

  toggleReconcile() {
    this.setData({ reconcileOpen: !this.data.reconcileOpen })
  },

  toggleFeeAdvanced() {
    this.setData({ feeAdvancedOpen: !this.data.feeAdvancedOpen })
  },

  onSaveOrder() {
    const result = this.data.result
    if (!result) {
      wx.showToast({ title: '先输入商品价格', icon: 'none' })
      return
    }
    const company = getCompanyById(this.data.form.companyId)
    const snapshot: OrderResultSnapshot = {
      netCostText: result.netCostText,
      perUnitText: result.showPerUnit ? result.perUnitText : '',
      paidText: result.paidText,
      refundText: result.refundText,
      cashbackText: result.cashbackText,
      feeText: result.feeText,
      savingsText: result.savingsText,
      effectiveDiscountText: result.effectiveDiscountText,
      settlementLabel: result.settlementLabel,
      rateText: result.rateText,
    }
    const quantity = this.data.form.quantity
    addOrder(
      `${company ? company.name : '退税单'} · ${formatNumber(
        parseNumber(this.data.form.price),
        0
      )} 円${quantity > 1 ? ` ×${quantity}` : ''}`,
      `${result.settlementLabel} · 到手 ${result.netCostText} · 省 ${result.savingsText}`,
      this.data.form as unknown as Record<string, unknown>,
      snapshot
    )
    wx.showToast({ title: '已保存这单', icon: 'success' })
  },

  onCopySummary() {
    const result = this.data.result
    if (!result) {
      wx.showToast({ title: '先输入商品价格', icon: 'none' })
      return
    }
    const lines = [
      `到手价：${result.netCostText}`,
      result.showPerUnit ? `单件：${result.perUnitText}` : '',
      `实付：${result.paidText}`,
      `退税：${result.refundText}`,
      `返现：${result.cashbackText}`,
      `手续费：${result.feeText}`,
      `比原价省：${result.savingsText}（${result.effectiveDiscountText}）`,
      `汇率：${result.rateText} 元/100日元`,
    ].filter(Boolean)
    wx.setClipboardData({ data: lines.join('\n') })
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },
})
