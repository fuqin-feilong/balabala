/**
 * 退税公司 / 机场现金参数
 *
 * 重要说明：
 * 1. 费率跟店走，这里的值是“默认值 + 门店预设”，最终以门店/退税单为准。
 * 2. confidence 用来区分可信度：
 *    - official：官方条款/官方 FAQ 可查
 *    - measured：截图实测或门店小票实测
 *    - estimate：截图明确写了“业界估算/未公布统一费率”
 * 3. 数据版本见 taxConfig.ts 的 DATA_VERSION。
 */

export type FeeBasis =
  | 'preTax' // 未税价
  | 'taxIncluded' // 含税价
  | 'grossRefund' // 税前退税额（消费税）
  | 'afterFees' // 扣完前面费用后的金额
  | 'fixed' // 定额日元

export type Confidence = 'official' | 'measured' | 'estimate'

export interface PayoutRounding {
  unitJPY: number
  mode: 'floor' | 'nearest'
}

export interface FeeRule {
  label: string
  pct?: number
  /** 官方费率区间，仅用于展示提示，不参与计算 */
  pctMin?: number
  pctMax?: number
  basis: FeeBasis
  fixedJPY?: number
  minJPY?: number
  maxJPY?: number
  optional?: boolean
  enabledByDefault?: boolean
  note?: string
}

export interface StorePreset {
  id: string
  name: string
  feePct: number
  feeBasis: 'preTax' | 'taxIncluded'
  fixedJPY?: number
  minJPY?: number
  note?: string
  confidence?: Confidence
}

export interface RefundCompany {
  id: string
  name: string
  kind: 'platform' | 'addon' | 'manual'
  confidence: Confidence
  verifiedAt: string
  sourceNote: string
  description: string
  fees: FeeRule[]
  payoutRounding?: PayoutRounding
  storePresets?: StorePreset[]
}

const SHARED_DISCLAIMER = '费率跟店走，可手改；实际以门店/退税单为准。'

export const REFUND_COMPANIES: RefundCompany[] = [
  {
    id: 'j-tax-refund',
    name: 'J-TaxRefund',
    kind: 'platform',
    confidence: 'measured',
    verifiedAt: '2026-11-19',
    sourceNote: `用户截图 2026-11；${SHARED_DISCLAIMER}`,
    description:
      '网页登记，免 App，退信用卡。大店多为 0%：多庆屋、BicCamera、唐吉诃德、札幌/鹤羽药妆；松本清 0.33%、GU 与东武 1%、二木高尔夫 1.5%、伊...',
    fees: [{ label: '服务费', pct: 1, basis: 'preTax' }],
    storePresets: [
      { id: 'default', name: '公司默认 1%', feePct: 1, feeBasis: 'preTax' },
      {
        id: 'big-store-0',
        name: '大店 0%（Bic/唐吉诃德等）',
        feePct: 0,
        feeBasis: 'preTax',
        note: '多庆屋、BicCamera、唐吉诃德、札幌/鹤羽药妆等大店常见 0%。',
      },
      { id: 'matsukiyo', name: '松本清 0.33%', feePct: 0.33, feeBasis: 'preTax' },
      { id: 'gu-tobu', name: 'GU / 东武 1%', feePct: 1, feeBasis: 'preTax' },
      { id: 'nigi', name: '二木高尔夫 1.5%', feePct: 1.5, feeBasis: 'preTax' },
    ],
  },
  {
    id: 'global-blue',
    name: 'Global Blue',
    kind: 'platform',
    confidence: 'measured',
    verifiedAt: '2026-11-04',
    sourceNote:
      '大阪高岛屋实测 2.3%（2026.11.4，退微信）；新制度下官方表示可能最高约 3%，且不少百货尚未公布新费率，务必按店修改。',
    description:
      '百货与精品常用。大阪高岛屋实测 2.3%（2026.11.4，退微信）；大丸松坂屋、阪急、友都八喜同为 2.3%，SUGI 药局 1.6%。注意：店内退人民币时汇率可能另有损耗。',
    fees: [{ label: '服务费', pct: 2.3, basis: 'preTax' }],
    storePresets: [
      { id: 'default', name: '公司默认 2.3%', feePct: 2.3, feeBasis: 'preTax' },
      {
        id: 'takashimaya',
        name: '高岛屋 / 大丸 / 阪急 2.3%',
        feePct: 2.3,
        feeBasis: 'preTax',
        note: '2026.11.4 大阪高岛屋实测；大丸松坂屋、阪急、友都八喜同为 2.3%。',
      },
      { id: 'sugi', name: 'SUGI 药局 1.6%', feePct: 1.6, feeBasis: 'preTax' },
    ],
  },
  {
    id: 'pie-vat',
    name: 'PIE VAT',
    kind: 'platform',
    confidence: 'official',
    verifiedAt: '2026-11-19',
    sourceNote:
      'PIE VAT 官方 FAQ：服务费 1.5%–3.0% + 提现费 0.28%–0.32%，两者都按未税价，从退税额中扣除。',
    description:
      '官方费率未税 1.5% 起，退信用卡。三井 Outlet、LaLaport 1.5%、涩谷 109 1.55%、Montbell 2–3%（商场内可能按商场统一费率）。另有提现费 0.28–0.32%，默认按 0.28% 计入。',
    fees: [
      { label: '服务费', pct: 1.5, basis: 'preTax' },
      {
        label: '提现费',
        pct: 0.28,
        pctMin: 0.28,
        pctMax: 0.32,
        basis: 'preTax',
        optional: true,
        enabledByDefault: true,
        note: '官方 0.28–0.32%，默认按区间下限 0.28% 计。',
      },
    ],
    storePresets: [
      { id: 'default', name: '公司默认 1.5%', feePct: 1.5, feeBasis: 'preTax' },
      { id: 'mitsui', name: '三井 Outlet / LaLaport 1.5%', feePct: 1.5, feeBasis: 'preTax' },
      { id: '109', name: '涩谷 109 1.55%', feePct: 1.55, feeBasis: 'preTax' },
      {
        id: 'montbell',
        name: 'Montbell 2% 起',
        feePct: 2,
        feeBasis: 'preTax',
        note: '截图写 2–3%，此处按区间下限 2% 起算，请按门店小票修改。',
      },
    ],
  },
  {
    id: 'jprefund',
    name: 'JPrefund',
    kind: 'platform',
    confidence: 'measured',
    verifiedAt: '2026-11-19',
    sourceNote: `用户截图 2026-11；${SHARED_DISCLAIMER}`,
    description:
      '网页登记，免 App。多为定额或按店：3COINS 定额 320 円、思梦乐 1–2.5%、MURASAKI SPORTS 2–3%、阿卡将含税 1.1%；AEON、PARCO...',
    fees: [{ label: '服务费', pct: 1.55, basis: 'preTax' }],
    storePresets: [
      { id: 'default', name: '公司默认 1.55%', feePct: 1.55, feeBasis: 'preTax' },
      {
        id: '3coins',
        name: '3COINS 定额 320 円',
        feePct: 0,
        feeBasis: 'preTax',
        fixedJPY: 320,
        note: '3COINS 为定额 320 円/笔。',
      },
      {
        id: 'shimamura',
        name: '思梦乐 1% 起',
        feePct: 1,
        feeBasis: 'preTax',
        note: '截图写 1–2.5%，此处按区间下限 1% 起算。',
      },
      {
        id: 'murasaki',
        name: 'MURASAKI 2% 起',
        feePct: 2,
        feeBasis: 'preTax',
        note: '截图写 2–3%，此处按区间下限 2% 起算。',
      },
      {
        id: 'akachan',
        name: '阿卡将 含税 1.1%',
        feePct: 1.1,
        feeBasis: 'taxIncluded',
        note: '阿卡将的 1.1% 按含税价计算。',
      },
    ],
  },
  {
    id: 'global-tax-free',
    name: 'Global Tax Free',
    kind: 'platform',
    confidence: 'estimate',
    verifiedAt: '2026-11-19',
    sourceNote: '截图写“未公布日本统一费率，业界约 1.55% 起”，属于估算值。',
    description: '未公布日本统一费率，业界约 1.55% 起，依店家而定。',
    fees: [{ label: '服务费', pct: 1.55, basis: 'preTax' }],
  },
  {
    id: 'tourego',
    name: 'Tourego',
    kind: 'platform',
    confidence: 'estimate',
    verifiedAt: '2026-11-19',
    sourceNote: '截图写“未公布统一费率，业界估约 1.5–2.2%”，属于估算值。',
    description: '未公布统一费率，百货与商店各自定，业界估约 1.5–2.2%。',
    fees: [{ label: '服务费', pct: 1.55, basis: 'preTax' }],
  },
  {
    id: 'japan-refund',
    name: 'JapanRefund',
    kind: 'platform',
    confidence: 'estimate',
    verifiedAt: '2026-11-19',
    sourceNote: '截图写“未公布统一费率，依合作店家公告为准”，属于估算值。',
    description: '未公布统一费率，依合作店家公告为准。',
    fees: [{ label: '服务费', pct: 1.55, basis: 'preTax' }],
  },
  {
    id: 'tax-refund-japan',
    name: 'Tax Refund Japan',
    kind: 'platform',
    confidence: 'measured',
    verifiedAt: '2026-11-19',
    sourceNote: '用户截图条款：收退税额的 20%，不足 300 円按 300 円收；建议发版前再向官方复核。',
    description:
      '官方条款：收退税额的 20%，算下来不足 300 円按 300 円收；线上商城下单取货的另算。',
    fees: [{ label: '服务费', pct: 20, basis: 'grossRefund', minJPY: 300 }],
  },
  {
    id: 'intaxfree',
    name: 'InTaxFree',
    kind: 'platform',
    confidence: 'estimate',
    verifiedAt: '2026-11-19',
    sourceNote: '截图写“变动制，约 1–1.5%”，属于估算值。',
    description: '变动制，约 1–1.5%，不少店家自己吸收；高岛屋、阪急有技术合作。',
    fees: [{ label: '服务费', pct: 1.5, basis: 'preTax' }],
  },
  {
    id: 'manual',
    name: '手动',
    kind: 'manual',
    confidence: 'estimate',
    verifiedAt: '2026-11-19',
    sourceNote: '用户自定义费率与计费基数。',
    description: '截图未列出的公司或门店，可手动填写费率、计费基数和最低/定额收费。',
    fees: [{ label: '手续费', pct: 0, basis: 'preTax' }],
  },
]

export const AIRPORT_ADDONS: RefundCompany[] = [
  {
    id: 'self-tax-refund',
    name: '机场现金·Self',
    kind: 'addon',
    confidence: 'official',
    verifiedAt: '2026-11-19',
    sourceNote:
      'Self Tax Refund 官方条款：按未税价 1.1%；退款金额不足 100 円部分舍去。与平台手续费分开叠加。',
    description:
      '机场自助机领日圆现金的服务费，按未税价 1.1%；羽田、成田、那霸。这个费用跟平台手续费是分开叠加的。官方示例：870 円实际给 800 円。',
    fees: [{ label: '机场现金费', pct: 1.1, basis: 'preTax' }],
    payoutRounding: { unitJPY: 100, mode: 'floor' },
  },
  {
    id: 'cash-japan',
    name: '机场现金·Cash Japan',
    kind: 'addon',
    confidence: 'official',
    verifiedAt: '2026-11-19',
    sourceNote:
      'Cash Japan 官方条款：标准服务费为退款业者指定退还金额的 10%，按 50 円单位调整；与平台手续费分开叠加。',
    description:
      '机场领日圆现金收退税款的 10%，跟平台手续费分开叠加；成田、关西、中部、福冈、新千岁、神户。按 50 円单位调整。官方示例：882 円调整到 900 円。',
    fees: [{ label: '机场现金费', pct: 10, basis: 'afterFees' }],
    payoutRounding: { unitJPY: 50, mode: 'nearest' },
  },
]

export function getCompanyById(id: string): RefundCompany | undefined {
  return REFUND_COMPANIES.find(company => company.id === id)
}

export function getAddonById(id: string): RefundCompany | undefined {
  return AIRPORT_ADDONS.find(addon => addon.id === id)
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  official: '官方',
  measured: '实测',
  estimate: '估算',
}

export const FEE_BASIS_LABELS: Record<FeeBasis, string> = {
  preTax: '按未税价百分比',
  taxIncluded: '按含税价百分比',
  grossRefund: '按退税额百分比',
  afterFees: '按平台费后金额百分比',
  fixed: '定额收费',
}
