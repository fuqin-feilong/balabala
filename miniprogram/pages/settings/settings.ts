import {
  AIRPORT_ADDONS,
  CONFIDENCE_LABELS,
  FEE_BASIS_LABELS,
  REFUND_COMPANIES,
  getCompanyById,
} from '../../data/refundCompanies'
import type { Confidence, FeeBasis, RefundCompany } from '../../data/refundCompanies'
import {
  DATA_VERSION,
  TAX_RATE_OPTIONS,
} from '../../data/taxConfig'
import { clearOrders, getOrders } from '../../services/orders'
import {
  clearRateCache,
  fetchMarketRate,
  getCachedRate,
} from '../../services/exchangeRate'
import {
  clearSavedForm,
  loadForm,
  requestReset,
} from '../../utils/storage'
import {
  SYSTEM_DEFAULTS,
  clearDefaults,
  defaultsFromForm,
  loadDefaults,
  normalizeDefaults,
  saveDefaults,
} from '../../utils/defaults'
import type { DefaultSettings } from '../../utils/defaults'
import { formatRate, formatShortTime, parseNumber } from '../../utils/format'

interface ParamView {
  id: string
  name: string
  kindLabel: string
  confidenceLabel: string
  confidenceClass: string
  verifiedAt: string
  description: string
  sourceNote: string
}

interface CompanyOption {
  id: string
  name: string
}

interface SelectOption {
  value: string
  label: string
}

const FEE_BASIS_OPTIONS: SelectOption[] = [
  { value: 'preTax', label: FEE_BASIS_LABELS.preTax },
  { value: 'taxIncluded', label: FEE_BASIS_LABELS.taxIncluded },
  { value: 'grossRefund', label: FEE_BASIS_LABELS.grossRefund },
  { value: 'afterFees', label: FEE_BASIS_LABELS.afterFees },
]

const ROUNDING_OPTIONS = [
  { value: 0, label: '不取整' },
  { value: 10, label: '整 10' },
  { value: 50, label: '整 50' },
  { value: 100, label: '整 100' },
]

const VALIDITY_OPTIONS = [
  { value: 'none', label: '不写' },
  { value: 'today', label: '当天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
]

function confidenceClass(confidence: Confidence): string {
  if (confidence === 'official') {
    return 'confidence-official'
  }
  if (confidence === 'measured') {
    return 'confidence-measured'
  }
  return 'confidence-estimate'
}

function toParamView(company: RefundCompany): ParamView {
  return {
    id: company.id,
    name: company.name,
    kindLabel:
      company.kind === 'addon'
        ? '机场现金'
        : company.kind === 'manual'
        ? '手动'
        : '平台',
    confidenceLabel:
      company.kind === 'manual'
        ? '自定义'
        : CONFIDENCE_LABELS[company.confidence],
    confidenceClass: confidenceClass(company.confidence),
    verifiedAt: company.verifiedAt,
    description: company.description,
    sourceNote: company.sourceNote,
  }
}

function parseList(text: string, fallback: number[]): number[] {
  const values = String(text)
    .split(/[,，/\s]+/)
    .map(item => parseNumber(item))
    .filter(item => item > 0)
  return values.length ? values : fallback
}

function mainFeeOfCompany(company: RefundCompany) {
  return company.fees[0] || { label: '手续费', pct: 0, basis: 'preTax' as FeeBasis }
}

Page({
  data: {
    dataVersion: DATA_VERSION,
    orderCount: 0,
    params: [] as ParamView[],
    defaults: SYSTEM_DEFAULTS as DefaultSettings,
    companies: REFUND_COMPANIES.map(company => ({
      id: company.id,
      name: company.name,
    })) as CompanyOption[],
    addons: [
      { id: 'none', name: '不用机场现金' },
      ...AIRPORT_ADDONS.map(addon => ({ id: addon.id, name: addon.name })),
    ] as CompanyOption[],
    companyIndex: 0,
    addonIndex: 0,
    companyName: '',
    addonName: '',
    taxRates: TAX_RATE_OPTIONS,
    feeBasisOptions: FEE_BASIS_OPTIONS,
    feeBasisIndex: 0,
    feeBasisLabel: '',
    roundingOptions: ROUNDING_OPTIONS,
    validityOptions: VALIDITY_OPTIONS,
    companyDefaultFeeText: '',
    cacheRateText: '',
    quoteProfitText: '',
    quoteFixedText: '',
  },

  onLoad() {
    this.applyDefaults(loadDefaults())
    this.setData({
      params: [...REFUND_COMPANIES, ...AIRPORT_ADDONS].map(toParamView),
    })
  },

  onShow() {
    this.setData({ orderCount: getOrders().length })
    this.refreshRateHint()
  },

  applyDefaults(defaults: DefaultSettings) {
    const normalized = normalizeDefaults(defaults)
    const companyIndex = Math.max(
      0,
      this.data.companies.findIndex(item => item.id === normalized.companyId)
    )
    const addonIndex = Math.max(
      0,
      this.data.addons.findIndex(item => item.id === normalized.addonId)
    )
    const feeBasisIndex = Math.max(
      0,
      FEE_BASIS_OPTIONS.findIndex(item => item.value === normalized.feeBasis)
    )
    this.setData({
      defaults: normalized,
      companyIndex,
      addonIndex,
      companyName: this.data.companies[companyIndex]
        ? this.data.companies[companyIndex].name
        : '',
      addonName: this.data.addons[addonIndex]
        ? this.data.addons[addonIndex].name
        : '',
      feeBasisIndex,
      feeBasisLabel: FEE_BASIS_OPTIONS[feeBasisIndex]
        ? FEE_BASIS_OPTIONS[feeBasisIndex].label
        : '',
      quoteProfitText: normalized.quoteProfitPcts.join(' / '),
      quoteFixedText: normalized.quoteFixedAdds.join(' / '),
      companyDefaultFeeText: this.buildCompanyFeeText(normalized.companyId),
    })
  },

  buildCompanyFeeText(companyId: string): string {
    const company = getCompanyById(companyId)
    if (!company) {
      return ''
    }
    const fee = mainFeeOfCompany(company)
    if (fee.basis === 'fixed') {
      return `${company.name} 默认：定额 ${fee.fixedJPY || 0} 円`
    }
    return `${company.name} 默认：${fee.pct || 0}%（${FEE_BASIS_LABELS[fee.basis]}）`
  },

  refreshRateHint() {
    const cached = getCachedRate()
    this.setData({
      cacheRateText: cached
        ? `本地缓存 ${formatRate(cached.ratePer100, 6)} · ${
            cached.updatedAt ? `${formatShortTime(cached.updatedAt)} 更新` : '时间未知'
          }`
        : '暂无实时汇率缓存',
    })
  },

  patchDefaults(patch: Partial<DefaultSettings>) {
    this.setData({
      defaults: { ...this.data.defaults, ...patch },
    })
  },

  collectDefaults(overrides?: Partial<DefaultSettings>): DefaultSettings {
    return normalizeDefaults({
      ...this.data.defaults,
      quoteProfitPcts: parseList(
        this.data.quoteProfitText,
        this.data.defaults.quoteProfitPcts
      ),
      quoteFixedAdds: parseList(
        this.data.quoteFixedText,
        this.data.defaults.quoteFixedAdds
      ),
      ...(overrides || {}),
    })
  },

  onTaxRateTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value)
    this.patchDefaults({ taxRatePct: value === 8 ? 8 : 10 })
  },

  onPriceModeTap(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value
    this.patchDefaults({
      priceMode: value === 'excluded' ? 'excluded' : 'included',
    })
  },

  onSettlementTap(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value
    this.patchDefaults({
      settlementMode: value === 'taxFree' ? 'taxFree' : 'refund',
    })
  },

  onCompanyChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    const company = this.data.companies[index]
    if (!company) {
      return
    }
    const patch: Partial<DefaultSettings> = { companyId: company.id }
    if (!this.data.defaults.feeCustom) {
      const found = getCompanyById(company.id)
      if (found) {
        const fee = mainFeeOfCompany(found)
        patch.feePct = String(fee.pct || 0)
        patch.feeBasis = fee.basis
        patch.feeIsFixed = fee.basis === 'fixed'
        patch.feeFixedJPY = fee.fixedJPY ? String(fee.fixedJPY) : ''
        patch.feeMinJPY = fee.minJPY ? String(fee.minJPY) : ''
      }
    }
    this.setData({
      companyIndex: index,
      companyName: company.name,
      defaults: { ...this.data.defaults, ...patch },
      companyDefaultFeeText: this.buildCompanyFeeText(company.id),
    })
  },

  onAddonChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    const addon = this.data.addons[index]
    if (!addon) {
      return
    }
    this.setData({
      addonIndex: index,
      addonName: addon.name,
      defaults: { ...this.data.defaults, addonId: addon.id },
    })
  },

  onFeeModeTap(e: WechatMiniprogram.TouchEvent) {
    const custom = e.currentTarget.dataset.value === 'custom'
    const defaults = this.data.defaults
    if (!custom) {
      const company = getCompanyById(defaults.companyId)
      if (company) {
        const fee = mainFeeOfCompany(company)
        this.setData({
          defaults: {
            ...defaults,
            feeCustom: false,
            feePct: String(fee.pct || 0),
            feeBasis: fee.basis,
            feeIsFixed: fee.basis === 'fixed',
            feeFixedJPY: fee.fixedJPY ? String(fee.fixedJPY) : '',
            feeMinJPY: fee.minJPY ? String(fee.minJPY) : '',
          },
        })
        return
      }
    }
    this.patchDefaults({ feeCustom: custom })
  },

  onFeePctInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ feePct: e.detail.value })
  },

  onFeeBasisChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    const option = FEE_BASIS_OPTIONS[index]
    if (!option) {
      return
    }
    this.setData({
      feeBasisIndex: index,
      feeBasisLabel: option.label,
      defaults: {
        ...this.data.defaults,
        feeBasis: option.value as FeeBasis,
        feeIsFixed: false,
      },
    })
  },

  onFeeFixedChange(e: WechatMiniprogram.SwitchChange) {
    this.patchDefaults({ feeIsFixed: e.detail.value })
  },

  onFeeFixedInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ feeFixedJPY: e.detail.value })
  },

  onFeeMinInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ feeMinJPY: e.detail.value })
  },

  onOptionalFeeChange(e: WechatMiniprogram.SwitchChange) {
    this.patchDefaults({ includeOptionalFees: e.detail.value })
  },

  onDiscountInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ discountPct: parseNumber(e.detail.value) })
  },

  onCashbackInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ cashbackPct: parseNumber(e.detail.value) })
  },

  onExtraFeeInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ extraFeeCNY: e.detail.value })
  },

  onRateInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ ratePer100: e.detail.value })
  },

  onFxLossInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ fxLossPct: e.detail.value })
  },

  onSyncRate() {
    wx.showLoading({ title: '同步汇率…' })
    fetchMarketRate()
      .then(result => {
        const defaults = this.collectDefaults({
          ratePer100: result.ratePer100.toFixed(8),
        })
        saveDefaults(defaults)
        this.applyDefaults(defaults)
        this.refreshRateHint()
        wx.hideLoading()
        wx.showToast({
          title: result.cached ? '已使用缓存汇率' : '已同步并保存默认汇率',
          icon: 'none',
        })
      })
      .catch((error: Error) => {
        wx.hideLoading()
        const message = error && error.message ? error.message : ''
        wx.showModal({
          title: '汇率同步失败',
          content: message || '请检查网络后重试，也可以手动填写默认汇率。',
          showCancel: false,
          confirmText: '知道了',
        })
      })
  },

  onQuoteModeTap(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value
    this.patchDefaults({
      quoteMode:
        value === 'pct' || value === 'fixed' || value === 'both'
          ? value
          : 'both',
    })
  },

  onQuoteProfitInput(e: WechatMiniprogram.Input) {
    this.setData({ quoteProfitText: e.detail.value })
  },

  onQuoteFixedInput(e: WechatMiniprogram.Input) {
    this.setData({ quoteFixedText: e.detail.value })
  },

  onQuoteBasisTap(e: WechatMiniprogram.TouchEvent) {
    this.patchDefaults({
      quoteBasis: e.currentTarget.dataset.value === 'margin' ? 'margin' : 'costPlus',
    })
  },

  onQuoteFloorInput(e: WechatMiniprogram.Input) {
    this.patchDefaults({ quoteFloorPct: parseNumber(e.detail.value) })
  },

  onQuoteRoundingTap(e: WechatMiniprogram.TouchEvent) {
    const value = Number(e.currentTarget.dataset.value)
    this.patchDefaults({
      quoteRounding: value === 10 || value === 50 || value === 100 ? value : 0,
    })
  },

  onQuoteValidityTap(e: WechatMiniprogram.TouchEvent) {
    const value = e.currentTarget.dataset.value
    this.patchDefaults({
      quoteValidity:
        value === 'none' || value === 'today' || value === '3' || value === '7'
          ? value
          : '7',
    })
  },

  onSaveDefaults() {
    const saved = saveDefaults(this.collectDefaults())
    this.applyDefaults(saved)
    wx.showToast({ title: '默认设置已保存', icon: 'success' })
  },

  onImportFromCalculator() {
    const form = loadForm<Record<string, unknown>>({})
    if (!form || !Object.keys(form).length) {
      wx.showToast({ title: '计算器还没有可读取的参数', icon: 'none' })
      return
    }
    const next = defaultsFromForm(form, this.collectDefaults())
    const saved = saveDefaults(next)
    this.applyDefaults(saved)
    wx.showToast({ title: '已保存计算器当前参数', icon: 'success' })
  },

  onResetDefaults() {
    wx.showModal({
      title: '恢复系统默认？',
      content: '会清除你保存的默认参数，计算器和报价页下次打开时回到系统默认值。',
      confirmText: '恢复',
      confirmColor: '#a56d0b',
      success: res => {
        if (!res.confirm) {
          return
        }
        clearDefaults()
        this.applyDefaults(SYSTEM_DEFAULTS)
        wx.showToast({ title: '已恢复系统默认', icon: 'none' })
      },
    })
  },

  onClearHistory() {
    wx.showModal({
      title: '清空历史订单？',
      content: '所有算过的单都会被删除，无法恢复。',
      confirmText: '清空',
      confirmColor: '#c05a3e',
      success: res => {
        if (!res.confirm) {
          return
        }
        clearOrders()
        this.setData({ orderCount: 0 })
        wx.showToast({ title: '已清空', icon: 'none' })
      },
    })
  },

  onResetForm() {
    wx.showModal({
      title: '恢复默认表单？',
      content: '会清除当前输入，退税参数回到你保存的默认设置。',
      confirmText: '恢复',
      confirmColor: '#a56d0b',
      success: res => {
        if (!res.confirm) {
          return
        }
        requestReset()
        clearSavedForm()
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },

  onClearRateCache() {
    clearRateCache()
    this.refreshRateHint()
    wx.showToast({ title: '汇率缓存已清除', icon: 'none' })
  },

  onRateHelp() {
    wx.showModal({
      title: '汇率同步说明',
      content:
        '汇率同步只抓取实时汇率网 JPY/CNY 页面，失败时使用本地缓存，再失败请手动填写。需要在微信公众平台把 www.shishihuilv.com 加入 request 合法域名。第三方网页可能改版或限流，数据仅供参考。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onParamHelp() {
    wx.showModal({
      title: '参数准确性说明',
      content:
        '退税费率跟店走，默认值来自截图和公开资料。标注“官方”的可查官方条款；标注“实测”的是门店/小票数据；标注“估算”的不是官方公布值。实际以门店和退税单为准，可在计算器里按小票手改。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  goCalculator() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' })
  },
})
