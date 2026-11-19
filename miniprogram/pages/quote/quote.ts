import {
  buildQuoteMessage,
  buildQuotes,
  uniqueNumbers,
  validityDays,
} from '../../utils/quote'
import type {
  QuoteBasis,
  QuoteInput,
  QuoteMode,
  QuoteRounding,
  QuoteValidity,
} from '../../utils/quote'
import { formatCNY, parseNumber } from '../../utils/format'
import {
  loadDefaults,
  quotePrefsFromDefaults,
} from '../../utils/defaults'
import {
  consumeQuoteSeed,
  loadQuoteForm,
  saveQuoteForm,
} from '../../utils/storage'

interface QuoteFormState {
  costCNY: string
  extraFeeCNY: string
  title: string
  note: string
  validity: QuoteValidity
  mode: QuoteMode
  selectedProfitPcts: number[]
  selectedFixedAdds: number[]
  profitOptions: number[]
  fixedOptions: number[]
  customProfit: string
  customFixed: string
  basis: QuoteBasis
  floorPct: number
  rounding: QuoteRounding
}

interface QuoteLineView {
  key: string
  label: string
  priceText: string
  profitText: string
  marginText: string
  belowFloor: boolean
}

interface ValidityOption {
  value: QuoteValidity
  label: string
}

interface RoundingOption {
  value: QuoteRounding
  label: string
}

interface NumberChipView {
  value: number
  label: string
  active: boolean
}

interface ValidityView extends ValidityOption {
  active: boolean
}

interface RoundingView extends RoundingOption {
  active: boolean
}

const VALIDITY_OPTIONS: ValidityOption[] = [
  { value: 'none', label: '不写' },
  { value: 'today', label: '当天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
]

const ROUNDING_OPTIONS: RoundingOption[] = [
  { value: 0, label: '不取整' },
  { value: 10, label: '整 10' },
  { value: 50, label: '整 50' },
  { value: 100, label: '整 100' },
]

const FLOOR_OPTIONS = [0, 5, 10, 15, 20]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function normalizeMode(value: QuoteMode): QuoteMode {
  if (value === 'pct' || value === 'fixed' || value === 'both') {
    return value
  }
  return 'both'
}

function normalizeBasis(value: QuoteBasis): QuoteBasis {
  return value === 'margin' ? 'margin' : 'costPlus'
}

function normalizeRounding(value: QuoteRounding): QuoteRounding {
  return value === 10 || value === 50 || value === 100 ? value : 0
}

function normalizeValidity(value: QuoteValidity): QuoteValidity {
  return value === 'none' || value === 'today' || value === '3' || value === '7'
    ? value
    : '7'
}

function normalizeQuoteForm(form: QuoteFormState): QuoteFormState {
  const profitOptions = uniqueNumbers(
    form.profitOptions.concat(form.selectedProfitPcts, [10, 20, 50, 100])
  ).sort((a, b) => a - b)
  const fixedOptions = uniqueNumbers(
    form.fixedOptions.concat(form.selectedFixedAdds, [30, 50, 100, 200])
  ).sort((a, b) => a - b)
  const selectedProfitPcts = uniqueNumbers(form.selectedProfitPcts)
    .filter(value => profitOptions.indexOf(value) >= 0)
    .sort((a, b) => a - b)
  const selectedFixedAdds = uniqueNumbers(form.selectedFixedAdds)
    .filter(value => fixedOptions.indexOf(value) >= 0)
    .sort((a, b) => a - b)
  return {
    ...form,
    mode: normalizeMode(form.mode),
    basis: normalizeBasis(form.basis),
    rounding: normalizeRounding(form.rounding),
    validity: normalizeValidity(form.validity),
    floorPct: clamp(parseNumber(form.floorPct), 0, 99),
    profitOptions,
    fixedOptions,
    selectedProfitPcts,
    selectedFixedAdds,
  }
}

function initialForm(): QuoteFormState {
  const defaults = loadDefaults()
  const prefs = quotePrefsFromDefaults(defaults)
  return normalizeQuoteForm({
    costCNY: '',
    extraFeeCNY: '0',
    title: '',
    note: '',
    validity: prefs.validity,
    mode: prefs.mode,
    selectedProfitPcts: prefs.profitPcts.slice(),
    selectedFixedAdds: prefs.fixedAdds.slice(),
    profitOptions: prefs.profitPcts.slice(),
    fixedOptions: prefs.fixedAdds.slice(),
    customProfit: '',
    customFixed: '',
    basis: prefs.basis,
    floorPct: prefs.floorPct,
    rounding: prefs.rounding,
  })
}

Page({
  data: {
    form: initialForm(),
    validityOptions: VALIDITY_OPTIONS.map(item => ({
      ...item,
      active: false,
    })) as ValidityView[],
    roundingOptions: ROUNDING_OPTIONS.map(item => ({
      ...item,
      active: false,
    })) as RoundingView[],
    floorOptions: FLOOR_OPTIONS.map(value => ({
      value,
      label: value ? `${value}%` : '不设',
      active: false,
    })) as NumberChipView[],
    profitOptionsView: [] as NumberChipView[],
    fixedOptionsView: [] as NumberChipView[],
    hasQuote: false,
    baseCostText: '¥0.00',
    quoteLines: [] as QuoteLineView[],
    warnings: [] as string[],
    validityText: '',
    costHint: '',
  },

  onLoad() {
    const prefs = quotePrefsFromDefaults(loadDefaults())
    const saved = loadQuoteForm(initialForm())
    const form = normalizeQuoteForm({
      ...saved,
      mode: prefs.mode,
      selectedProfitPcts: prefs.profitPcts.slice(),
      selectedFixedAdds: prefs.fixedAdds.slice(),
      basis: prefs.basis,
      floorPct: prefs.floorPct,
      rounding: prefs.rounding,
      validity: prefs.validity,
    })
    this.setData({ form }, () => this.recalculate())
  },

  onShow() {
    const seed = consumeQuoteSeed()
    if (seed) {
      this.setData(
        {
          'form.costCNY': seed.costCNY.toFixed(2),
        },
        () => {
          this.recalculate()
          wx.showToast({ title: '已带入计算器成本', icon: 'none' })
        }
      )
    }
  },

  onHide() {
    this.persist()
  },

  onUnload() {
    this.persist()
  },

  persist() {
    saveQuoteForm(this.data.form as unknown as Record<string, unknown>)
  },

  buildInput(): QuoteInput {
    const form = this.data.form
    return {
      costCNY: parseNumber(form.costCNY),
      extraFeeCNY: parseNumber(form.extraFeeCNY),
      mode: form.mode,
      profitPcts: form.selectedProfitPcts,
      fixedAdds: form.selectedFixedAdds,
      basis: form.basis,
      floorPct: form.floorPct,
      rounding: form.rounding,
    }
  },

  recalculate() {
    const form = this.data.form
    const result = buildQuotes(this.buildInput())
    const quoteLines: QuoteLineView[] = result.lines.map(line => ({
      key: line.key,
      label: line.label,
      priceText: formatCNY(line.quoteCNY),
      profitText: formatCNY(line.profitCNY),
      marginText: `${line.marginPct}%`,
      belowFloor: line.belowFloor,
    }))
    const cost = parseNumber(form.costCNY)
    const validityText =
      form.validity === 'none'
        ? ''
        : form.validity === 'today'
        ? '仅限当天'
        : `${validityDays(form.validity)} 天`
    this.setData({
      hasQuote: cost > 0,
      baseCostText: formatCNY(result.baseCost),
      quoteLines,
      warnings: result.warnings,
      validityText,
      profitOptionsView: form.profitOptions.map(value => ({
        value,
        label: `${value}%`,
        active: form.selectedProfitPcts.indexOf(value) >= 0,
      })),
      fixedOptionsView: form.fixedOptions.map(value => ({
        value,
        label: `+${value}`,
        active: form.selectedFixedAdds.indexOf(value) >= 0,
      })),
      floorOptions: FLOOR_OPTIONS.map(value => ({
        value,
        label: value ? `${value}%` : '不设',
        active: form.floorPct === value,
      })),
      validityOptions: VALIDITY_OPTIONS.map(item => ({
        ...item,
        active: form.validity === item.value,
      })),
      roundingOptions: ROUNDING_OPTIONS.map(item => ({
        ...item,
        active: form.rounding === item.value,
      })),
      costHint:
        cost > 0
          ? `报价基数 ${formatCNY(result.baseCost)}（到手成本 + 附加费用）`
          : '填入到手成本后自动生成报价',
    })
  },

  patchForm(patch: Record<string, unknown>, shouldRecalc = true) {
    this.setData(patch as unknown as Record<string, unknown>, () => {
      if (shouldRecalc) {
        this.recalculate()
      }
    })
  },

  onCostInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.costCNY': e.detail.value })
  },

  onExtraFeeInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.extraFeeCNY': e.detail.value })
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.title': e.detail.value }, false)
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.note': e.detail.value }, false)
  },

  onValidityTap(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value as QuoteValidity
    this.patchForm({ 'form.validity': value })
  },

  onModeTap(e: WechatMiniprogram.TouchEvent) {
    const mode = e.currentTarget.dataset.value as QuoteMode
    this.patchForm({ 'form.mode': mode })
  },

  onBasisTap(e: WechatMiniprogram.TouchEvent) {
    const basis = e.currentTarget.dataset.value as QuoteBasis
    this.patchForm({ 'form.basis': basis })
  },

  onRoundingTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value) as QuoteRounding
    this.patchForm({ 'form.rounding': value })
  },

  onFloorTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value)
    this.patchForm({ 'form.floorPct': value })
  },

  onFloorInput(e: WechatMiniprogram.Input) {
    const value = clamp(parseNumber(e.detail.value), 0, 99)
    this.patchForm({ 'form.floorPct': value })
  },

  onProfitChipTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value)
    if (!Number.isFinite(value) || value <= 0) {
      return
    }
    const selected = this.data.form.selectedProfitPcts.slice()
    const index = selected.indexOf(value)
    if (index >= 0) {
      selected.splice(index, 1)
    } else {
      selected.push(value)
    }
    this.patchForm({ 'form.selectedProfitPcts': selected })
  },

  onFixedChipTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value)
    if (!Number.isFinite(value) || value <= 0) {
      return
    }
    const selected = this.data.form.selectedFixedAdds.slice()
    const index = selected.indexOf(value)
    if (index >= 0) {
      selected.splice(index, 1)
    } else {
      selected.push(value)
    }
    this.patchForm({ 'form.selectedFixedAdds': selected })
  },

  onCustomProfitInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.customProfit': e.detail.value }, false)
  },

  onCustomFixedInput(e: WechatMiniprogram.Input) {
    this.patchForm({ 'form.customFixed': e.detail.value }, false)
  },

  onAddCustomProfit() {
    const value = Math.min(99, parseNumber(this.data.form.customProfit))
    if (value <= 0) {
      wx.showToast({ title: '请输入大于 0 的利润率', icon: 'none' })
      return
    }
    const options = uniqueNumbers(
      this.data.form.profitOptions.concat([value])
    )
    const selected = uniqueNumbers(
      this.data.form.selectedProfitPcts.concat([value])
    )
    this.patchForm({
      'form.profitOptions': options,
      'form.selectedProfitPcts': selected,
      'form.customProfit': '',
    })
  },

  onAddCustomFixed() {
    const value = parseNumber(this.data.form.customFixed)
    if (value <= 0) {
      wx.showToast({ title: '请输入大于 0 的加价金额', icon: 'none' })
      return
    }
    const options = uniqueNumbers(this.data.form.fixedOptions.concat([value]))
    const selected = uniqueNumbers(
      this.data.form.selectedFixedAdds.concat([value])
    )
    this.patchForm({
      'form.fixedOptions': options,
      'form.selectedFixedAdds': selected,
      'form.customFixed': '',
    })
  },

  onCopyLine(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key || '')
    const line = this.data.quoteLines.find(item => item.key === key)
    if (!line) {
      return
    }
    wx.setClipboardData({
      data: `${line.label}：${line.priceText}`,
    })
  },

  onCopyAll() {
    const result = buildQuotes(this.buildInput())
    if (!result.lines.length) {
      wx.showToast({ title: '还没有可复制的报价', icon: 'none' })
      return
    }
    const text = buildQuoteMessage({
      title: this.data.form.title,
      note: this.data.form.note,
      validity: this.data.form.validity,
      lines: result.lines,
    })
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '报价文案已复制', icon: 'success' })
      },
    })
  },

  onClear() {
    wx.showModal({
      title: '清空重填？',
      content: '会清空成本、商品名、附注和当前选择，默认设置不会变。',
      confirmText: '清空',
      success: res => {
        if (!res.confirm) {
          return
        }
        this.setData({ form: initialForm() }, () => {
          this.recalculate()
          this.persist()
        })
      },
    })
  },

  goCalculator() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
