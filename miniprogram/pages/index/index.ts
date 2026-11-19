// 修改这里即可更新顶部公告
const announcementText = '公告：汇率会实时变化，请根据当前实际汇率填写。'

Component({
  data: {
    announcement: announcementText,
    taxFeeHelpVisible: false,
    clearedFields: {} as Record<string, boolean>,
    form: {
      taxIncludedPrice: '401500',
      discount: '1',
      cardRate: '0.0423',
      rebateTaxRate: '0.038',
      rebatePoints: '0.02',
      taxFee: '0',
      taxFeeCurrency: 'JPY' as 'CNY' | 'JPY',
    },
    result: null as {
      tax: string
      cardCost: string
      rebate: string
      taxFee: string
      finalCost: string
    } | null,
  },
  methods: {
    onInputFocus(e: WechatMiniprogram.Input) {
      const field = e.currentTarget.dataset.field as string
      if (this.data.clearedFields[field]) {
        return
      }

      this.setData({
        [`form.${field}`]: '',
        [`clearedFields.${field}`]: true,
      })
    },

    onInputChange(e: WechatMiniprogram.Input) {
      const field = e.currentTarget.dataset.field as keyof typeof this.data.form
      this.setData({
        [`form.${field}`]: e.detail.value,
      })
    },

    toggleTaxFeeHelp() {
      this.setData({
        taxFeeHelpVisible: !this.data.taxFeeHelpVisible,
      })
    },

    onTaxFeeCurrencyChange(e: WechatMiniprogram.TouchEvent) {
      const currency = e.currentTarget.dataset.currency as 'CNY' | 'JPY'
      this.setData({
        'form.taxFeeCurrency': currency,
      })
    },

    calculate() {
      const {
        taxIncludedPrice,
        discount,
        cardRate,
        rebateTaxRate,
        rebatePoints,
        taxFee,
        taxFeeCurrency,
      } = this.data.form
      const values = [
        taxIncludedPrice,
        discount,
        cardRate,
        rebateTaxRate,
        rebatePoints,
        taxFee,
      ].map(value => Number.parseFloat(value))

      if (values.some(value => !Number.isFinite(value))) {
        wx.showToast({
          title: '请输入有效数字',
          icon: 'none',
        })
        return
      }

      const [price, discountValue, cardRateValue, taxRateValue, pointsValue, taxFeeValue] = values
      const tax = price / 1.1 * discountValue * 0.1 * 0.77 * taxRateValue
      const cardCost = price * discountValue * cardRateValue
      const rebate = price / 1.1 * discountValue * pointsValue * cardRateValue
      const taxFeeInRmb = taxFeeCurrency === 'JPY' ? taxFeeValue * taxRateValue : taxFeeValue
      const finalCost = cardCost - tax - rebate + taxFeeInRmb

      this.setData({
        result: {
          tax: tax.toFixed(2),
          cardCost: cardCost.toFixed(2),
          rebate: rebate.toFixed(2),
          taxFee: taxFeeInRmb.toFixed(2),
          finalCost: finalCost.toFixed(2),
        },
      })
    },
  },
})
