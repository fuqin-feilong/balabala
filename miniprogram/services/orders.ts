import { DATA_VERSION } from '../data/taxConfig'
import { loadOrders, saveOrders, requestRestore } from '../utils/storage'

const MAX_ORDERS = 100

export interface OrderResultSnapshot {
  netCostText: string
  perUnitText: string
  paidText: string
  refundText: string
  cashbackText: string
  feeText: string
  savingsText: string
  effectiveDiscountText: string
  settlementLabel: string
  rateText: string
}

export interface SavedOrder {
  id: string
  createdAt: number
  title: string
  subtitle: string
  form: Record<string, unknown>
  result: OrderResultSnapshot
  paramsVersion: string
}

export function getOrders(): SavedOrder[] {
  const orders = loadOrders<SavedOrder>()
  return orders
    .filter(order => order && typeof order.id === 'string')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function addOrder(
  title: string,
  subtitle: string,
  form: Record<string, unknown>,
  result: OrderResultSnapshot
): SavedOrder {
  const order: SavedOrder = {
    id: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: Date.now(),
    title: title.slice(0, 40),
    subtitle: subtitle.slice(0, 80),
    form,
    result,
    paramsVersion: DATA_VERSION,
  }

  const next = [order, ...getOrders()].slice(0, MAX_ORDERS)
  saveOrders(next)
  return order
}

export function deleteOrder(id: string): SavedOrder[] {
  const next = getOrders().filter(order => order.id !== id)
  saveOrders(next)
  return next
}

export function clearOrders(): void {
  saveOrders([])
}

export function restoreOrder(order: SavedOrder): void {
  requestRestore(order.form)
}
