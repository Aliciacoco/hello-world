export function earnPoints(
  amountOrBankType: number | string,
  reason: string,
  activity: 'practice' | 'upload' | 'theme-bonus' = 'practice',
  bankType?: string,
) {
  // 如果第一个参数是字符串，说明是新的调用方式：传递 bankType
  // 如果是数字，说明是旧的调用方式：传递 amount（向后兼容）
  const body = typeof amountOrBankType === 'string'
    ? { reason, bankType: amountOrBankType }
    : { amount: amountOrBankType, reason, bankType }

  fetch('/api/points/earn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(r => r.json())
    .then((data: { balance: number }) => {
      // 如果是新调用方式，amount 参数在这里不可用，但 toast 只需要 balance
      const amount = typeof amountOrBankType === 'number' ? amountOrBankType : 0
      window.dispatchEvent(
        new CustomEvent('points-earned', { detail: { amount, balance: data.balance, activity, bankType: typeof amountOrBankType === 'string' ? amountOrBankType : bankType } })
      )
    })
    .catch(() => {})
}
