import { DATA_VERSION } from '../../data/taxConfig'
import {
  clearOrders as clearAllOrders,
  deleteOrder as removeOrder,
  getOrders,
  restoreOrder,
} from '../../services/orders'
import type { SavedOrder } from '../../services/orders'
import { formatTime } from '../../utils/format'

interface OrderView extends SavedOrder {
  timeText: string
}

Page({
  data: {
    orders: [] as OrderView[],
    dataVersion: DATA_VERSION,
  },

  onShow() {
    this.loadOrders()
  },

  loadOrders() {
    const orders = getOrders().map(order => ({
      ...order,
      timeText: formatTime(order.createdAt),
    }))
    this.setData({ orders })
  },

  onRestore(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const order = this.data.orders.find(item => item.id === id)
    if (!order) {
      return
    }
    restoreOrder(order)
    wx.switchTab({ url: '/pages/index/index' })
  },

  onDelete(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.showModal({
      title: '删除这单？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#c05a3e',
      success: res => {
        if (!res.confirm) {
          return
        }
        removeOrder(id)
        this.loadOrders()
        wx.showToast({ title: '已删除', icon: 'none' })
      },
    })
  },

  onClear() {
    wx.showModal({
      title: '清空全部历史？',
      content: '所有算过的单都会被删除，无法恢复。',
      confirmText: '清空',
      confirmColor: '#c05a3e',
      success: res => {
        if (!res.confirm) {
          return
        }
        clearAllOrders()
        this.loadOrders()
        wx.showToast({ title: '已清空', icon: 'none' })
      },
    })
  },

  goCalculator() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
