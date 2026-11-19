export const FORM_KEY = 'daigou_calc_form_v2'
export const RESTORE_KEY = 'daigou_calc_restore_v2'
export const RESET_KEY = 'daigou_calc_reset_v2'
export const ORDERS_KEY = 'daigou_calc_orders_v2'

export function loadForm<T extends object>(fallback: T): T {
  try {
    const saved = wx.getStorageSync(FORM_KEY)
    if (!saved || typeof saved !== 'object') {
      return fallback
    }
    return { ...(fallback as object), ...(saved as object) } as T
  } catch (error) {
    return fallback
  }
}

export function saveForm(form: Record<string, unknown>): void {
  try {
    wx.setStorageSync(FORM_KEY, form)
  } catch (error) {
    // 本地存储失败不影响计算
  }
}

export function requestRestore(form: Record<string, unknown>): void {
  try {
    wx.setStorageSync(FORM_KEY, form)
    wx.setStorageSync(RESTORE_KEY, true)
  } catch (error) {
    // ignore
  }
}

export function isRestorePending(): boolean {
  try {
    return Boolean(wx.getStorageSync(RESTORE_KEY))
  } catch (error) {
    return false
  }
}

export function consumeRestore(): boolean {
  try {
    const shouldRestore = Boolean(wx.getStorageSync(RESTORE_KEY))
    if (shouldRestore) {
      wx.removeStorageSync(RESTORE_KEY)
    }
    return shouldRestore
  } catch (error) {
    return false
  }
}

export function requestReset(): void {
  try {
    wx.setStorageSync(RESET_KEY, true)
  } catch (error) {
    // ignore
  }
}

export function isResetPending(): boolean {
  try {
    return Boolean(wx.getStorageSync(RESET_KEY))
  } catch (error) {
    return false
  }
}

export function consumeReset(): boolean {
  try {
    const shouldReset = Boolean(wx.getStorageSync(RESET_KEY))
    if (shouldReset) {
      wx.removeStorageSync(RESET_KEY)
    }
    return shouldReset
  } catch (error) {
    return false
  }
}

export function loadOrders<T>(): T[] {
  try {
    const saved = wx.getStorageSync(ORDERS_KEY)
    return Array.isArray(saved) ? (saved as T[]) : []
  } catch (error) {
    return []
  }
}

export function saveOrders<T>(orders: T[]): void {
  try {
    wx.setStorageSync(ORDERS_KEY, orders)
  } catch (error) {
    // ignore
  }
}

export function clearSavedForm(): void {
  try {
    wx.removeStorageSync(FORM_KEY)
    wx.removeStorageSync(RESTORE_KEY)
  } catch (error) {
    // ignore
  }
}
