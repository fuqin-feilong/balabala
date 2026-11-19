const CACHE_KEY = 'daigou_rate_cache_v3'
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX_AGE = CACHE_TTL * 6
const SHISHIHUILV_URL = 'https://www.shishihuilv.com/JPY-CNY-100.html'

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

function saveCache(result: RateResult): void {
  try {
    const cache: RateCache = {
      ratePer100: result.ratePer100,
      updatedAt: result.updatedAt,
      source: result.source,
    }
    wx.setStorageSync(CACHE_KEY, cache)
  } catch (error) {
    // 缓存失败不影响本次同步
  }
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

/**
 * 解析实时汇率网 JPY/CNY 页面。
 * 页面里有两处可用数据：
 * 1. 当前汇率：1 JPY = 0.04171423 CNY
 * 2. 100 日元（JPY）= 4.17142315 人民币（CNY）
 * 3. 更新时间：2026-11-19 16:30:03
 */
export function parseShishihuilvRate(html: string): RateResult | null {
  if (!html || typeof html !== 'string') {
    return null
  }

  const source = html.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ')
  const per1Match =
    source.match(/当前汇率[：:]\s*1\s*JPY\s*=\s*([0-9.]+)\s*CNY/i) ||
    source.match(/1\s*JPY\s*=\s*([0-9.]+)\s*CNY/i)
  const per100Match =
    source.match(
      /100\s*日元[^<]*?=\s*<\/p>\s*<p[^>]*class="to"[^>]*>\s*([0-9.,]+)\s*人民币/i
    ) || source.match(/class="to"[^>]*>\s*([0-9.,]+)\s*人民币/i)

  let ratePer100 = 0
  if (per100Match) {
    // 页面是 100 日元页面，优先用页面直接给出的 4.17142315，避免二次乘算误差
    ratePer100 = Number(String(per100Match[1]).replace(/,/g, ''))
  } else if (per1Match) {
    ratePer100 = Number(per1Match[1]) * 100
  }

  if (!Number.isFinite(ratePer100) || ratePer100 <= 0.1 || ratePer100 >= 100) {
    return null
  }

  let updatedAt = Date.now()
  const timeMatch = source.match(
    /更新时间[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/
  )
  if (timeMatch) {
    // 站点时间为中国标准时间
    const parsed = new Date(`${timeMatch[1]}T${timeMatch[2]}+08:00`).getTime()
    if (Number.isFinite(parsed)) {
      updatedAt = parsed
    }
  }

  return {
    ratePer100,
    updatedAt,
    source: '实时汇率网',
    cached: false,
  }
}

function fetchFromShishihuilv(): Promise<RateResult> {
  return new Promise((resolve, reject) => {
    // 站点返回 Cache-Control: max-age=7776000，必须加时间戳绕过缓存
    const url = `${SHISHIHUILV_URL}?t=${Date.now()}`
    wx.request({
      url,
      method: 'GET',
      timeout: 10000,
      dataType: '其他',
      header: {
        Accept: 'text/html,application/xhtml+xml',
      },
      success: res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`实时汇率网：HTTP ${res.statusCode}`))
          return
        }
        const html = typeof res.data === 'string' ? res.data : ''
        const result = parseShishihuilvRate(html)
        if (!result) {
          reject(new Error('实时汇率网：网页解析失败'))
          return
        }
        saveCache(result)
        resolve(result)
      },
      fail: err => {
        const errMsg = err && err.errMsg ? err.errMsg : '请求失败'
        reject(new Error(`实时汇率网：${errMsg}`))
      },
    })
  })
}

export function fetchMarketRate(): Promise<RateResult> {
  return fetchFromShishihuilv().catch((error: Error) => {
    const cached = getCachedRate()
    if (cached && Date.now() - cached.updatedAt <= CACHE_MAX_AGE) {
      return cached
    }
    const message =
      error && error.message ? error.message : '实时汇率网请求失败'
    throw new Error(message)
  })
}

export function clearRateCache(): void {
  try {
    wx.removeStorageSync(CACHE_KEY)
    // 清掉旧版本可能残留的缓存
    wx.removeStorageSync('daigou_rate_cache_v2')
  } catch (error) {
    // ignore
  }
}
