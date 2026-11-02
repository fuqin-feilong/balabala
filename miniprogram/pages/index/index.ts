Component({
  data: {
    form: {
      taxIncludedPrice: '401500',
      discount: '1',
      cardRate: '0.0423',
      rebateTaxRate: '0.038',
      rebatePoints: '0.02',
    },
    result: null as {
      tax: string
      cardCost: string
      rebate: string
      finalCost: string
    } | null,
  },
  methods: {
    onInputChange(e: WechatMiniprogram.Input) {
      const field = e.currentTarget.dataset.field as keyof typeof this.data.form
      this.setData({
        [`form.${field}`]: e.detail.value,
      })
    },

    calculate() {
      const {
        taxIncludedPrice,
        discount,
        cardRate,
        rebateTaxRate,
        rebatePoints,
      } = this.data.form
      const values = [
        taxIncludedPrice,
        discount,
        cardRate,
        rebateTaxRate,
        rebatePoints,
      ].map(value => Number.parseFloat(value))

      if (values.some(value => !Number.isFinite(value))) {
        wx.showToast({
          title: '请输入有效数字',
          icon: 'none',
        })
        return
      }

      const [price, discountValue, cardRateValue, taxRateValue, pointsValue] = values
      const tax = price / 1.1 * discountValue * 0.1 * 0.77 * taxRateValue
      const cardCost = price * discountValue * cardRateValue
      const rebate = price / 1.1 * discountValue * pointsValue * cardRateValue
      const finalCost = cardCost - tax - rebate

      this.setData({
        result: {
          tax: tax.toFixed(2),
          cardCost: cardCost.toFixed(2),
          rebate: rebate.toFixed(2),
          finalCost: finalCost.toFixed(2),
        },
      })
    },
  },
})
