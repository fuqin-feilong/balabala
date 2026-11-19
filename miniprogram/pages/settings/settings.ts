import {
  AIRPORT_ADDONS,
  CONFIDENCE_LABELS,
  REFUND_COMPANIES,
} from '../../data/refundCompanies'
import type { Confidence, RefundCompany } from '../../data/refundCompanies'
import { DATA_VERSION } from '../../data/taxConfig'
import { clearOrders, getOrders } from '../../services/orders'
import { clearRateCache } from '../../services/exchangeRate'
import { clearSavedForm, requestReset } from '../../utils/storage'

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

Page({
  data: {
    dataVersion: DATA_VERSION,
    orderCount: 0,
    params: [] as ParamView[],
  },

  onLoad() {
    this.setData({
      params: [...REFUND_COMPANIES, ...AIRPORT_ADDONS].map(toParamView),
    })
  },

  onShow() {
    this.setData({ orderCount: getOrders().length })
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
      content: '会清除当前输入和自定义费率，退税参数恢复为公司默认值。',
      confirmText: '恢复',
      confirmColor: '#a56d0b',
      success: res => {
        if (!res.confirm) {
          return
        }
        requestReset()
        clearSavedForm()
        const pages = getCurrentPages()
        const previous = pages.length > 1 ? pages[pages.length - 2] : null
        if (previous && previous.route === 'pages/index/index') {
          wx.navigateBack()
        } else {
          wx.reLaunch({ url: '/pages/index/index' })
        }
      },
    })
  },

  onClearRateCache() {
    clearRateCache()
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
    wx.reLaunch({ url: '/pages/index/index' })
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },
})
