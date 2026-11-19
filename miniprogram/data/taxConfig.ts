/** 税率 / 门槛 / 默认值 / 版本号 */

export interface TaxRateOption {
  value: number
  label: string
  hint: string
}

export const TAX_RATE_OPTIONS: TaxRateOption[] = [
  { value: 10, label: '10%', hint: '一般商品' },
  { value: 8, label: '8%', hint: '食品/饮料等轻减税率' },
]

export interface NumberOption {
  value: number
  label: string
}

export const DISCOUNT_OPTIONS: NumberOption[] = [
  { value: 0, label: '不打折' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' },
  { value: 30, label: '30%' },
]

export const CASHBACK_OPTIONS: NumberOption[] = [
  { value: 0, label: '无返现' },
  { value: 3, label: '3%' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 10, label: '10%' },
]

/** 2026-11-01 起「先付后退」：同店同日未税满 5,000 円 */
export const TAX_FREE_MIN_PRE_TAX_JPY = 5000
export const NEW_REFUND_SYSTEM_DATE = '2026-11-01'
export const DATA_VERSION = '2026-11-19'

/** 没有实时汇率时的参考中间价（元/100 日元） */
export const DEFAULT_RATE_PER_100 = 4.1902

/** 支付宝口径仅作估算展示，不硬编码 4.1919 */
export const ALIPAY_SPREAD_PCT = 0.04

export const MAX_QUANTITY = 99

export const RATE_SOURCE_LABELS: Record<string, string> = {
  default: '默认参考价',
  market: '市场价',
  shishihuilv: '实时汇率网',
  cache: '缓存汇率',
  alipay: '支付宝口径估算',
  manual: '手填',
}
