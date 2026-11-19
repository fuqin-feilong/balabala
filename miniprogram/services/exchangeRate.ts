import { DEFAULT_RATE_PER_100 } from '../data/taxConfig'

const CACHE_KEY = 'daigou_rate_cache_v2'
const CACHE_TTL = 10 * 60 * 1000
const API_URL = 'https://api.frankfurter.app/latest?from=JPY&to=CNY'

export interface RateResult {
  ratePer100: number
  updatedAt: number
  source: string
  cached: boolean
}

interface RateCache {
  ratePer100: number
  updatedAt: number
  source: string
}

function readCache(): RateCache | null {
  try {
    const cached = wx.getStorageSync(CACHE_KEY) as RateCache | ''
    if (
      cached &&
      typeof cached === 'object' &&
      Number.isFinite(cached.ratePer100) &&
      cached.ratePer100 > 0
    ) {
      return cached
    }
  } catch (error) {
    // ignore
  }
  return null
}

export function getCachedRate(): RateResult | null {
  const cached = readCache()
  if (!cached) {
    return null
  }
  return {
    ratePer100: cached.ratePer100,
    updatedAt: cached.updatedAt,
    source: cached.source,
    cached: true,
  }
}

export function getFallbackRate(): RateResult {
  return {
    ratePer100: DEFAULT_RATE_PER_100,
    updatedAt: 0,
    source: '默认参考价',
    cached: false,
  }
}

export function fetchMarketRate(): Promise<RateResult> {
  return new Promise((resolve, reject) => {
    const finishWithCache = () => {
      const cached = getCachedRate()
      if (cached && Date.now() - cached.updatedAt <= CACHE_TTL * 6) {
        resolve(cached)
        return
      }
      reject(new Error('汇率同步失败，请手动填写'))
    }

    wx.request({
      url: API_URL,
      method: 'GET',
      timeout: 8000,
      success: res => {
        const data = res.data as unknown as {
          rates?: { CNY?: number }
          date?: string
        }
        const cny = data && data.rates ? data.rates.CNY : undefined
        if (!cny || !Number.isFinite(cny) || cny <= 0) {
          finishWithCache()
          return
        }
        const result: RateResult = {
          ratePer100: cny * 100,
          updatedAt: Date.now(),
          source: 'Frankfurter / ECB',
          cached: false,
        }
        try {
          wx.setStorageSync(CACHE_KEY, {
            ratePer100: result.ratePer100,
            updatedAt: result.updatedAt,
            source: result.source,
          })
        } catch (error) {
          // ignore
        }
        resolve(result)
      },
      fail: () => {
        finishWithCache()
      },
    })
  })
}

export function clearRateCache(): void {
  try {
    wx.removeStorageSync(CACHE_KEY)
  } catch (error) {
    // ignore
  }
}
