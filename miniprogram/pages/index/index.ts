// 修改这里即可更新顶部公告
const announcementText = '公告：汇率会实时变化，请根据当前实际汇率填写。'

Component({
  data: {
    announcement: announcementText,
    form: {
      taxIncludedPrice: '401500',
      discount: '1',
      cardRate: '0.0423',
      rebateTaxRate: '0.038',
      rebatePoints: '0.02',
      taxFee: '0',
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
    onInputChange(e: WechatMiniprogram.Input) {
      const field = e.currentTarget.dataset.field as keyof typeof this.data.form
      this.setData({
        [`form.${field}`]: e.detail.value,
      })
    },

    showTaxFeeHelp() {
      wx.showModal({
        title: '退税手续费费用说明',
        content: '日本购物退税会产生手续费，(包含1.2.3.4.)，最终反回来的钱会少，少的金额，可自行填写。\n1. Processing Fee（处理费 / 业务办理费）\n2. Transaction Fee（交易手续费 / 支付通道费）\n3. Inter Remit Fee（中间行汇款费 / 跨境中转费）\n4. Consumption Tax (10%)（消费税 10%）',
        showCancel: false,
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
      const finalCost = cardCost - tax - rebate + taxFeeValue

      this.setData({
        result: {
          tax: tax.toFixed(2),
          cardCost: cardCost.toFixed(2),
          rebate: rebate.toFixed(2),
          taxFee: taxFeeValue.toFixed(2),
          finalCost: finalCost.toFixed(2),
        },
      })
    },
  },
})
