export function earnPoints(amount: number, reason: string) {
  fetch('/api/points/earn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reason }),
  })
    .then(r => r.json())
    .then((data: { balance: number }) => {
      window.dispatchEvent(
        new CustomEvent('points-earned', { detail: { amount, balance: data.balance } })
      )
    })
    .catch(() => {})
}
