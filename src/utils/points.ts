export function earnPoints(amount: number, reason: string, activity: 'practice' | 'upload' | 'theme-bonus' = 'practice') {
  fetch('/api/points/earn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reason }),
  })
    .then(r => r.json())
    .then((data: { balance: number }) => {
      window.dispatchEvent(
        new CustomEvent('points-earned', { detail: { amount, balance: data.balance, activity } })
      )
    })
    .catch(() => {})
}
