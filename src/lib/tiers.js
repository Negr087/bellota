// Acorn colors by denomination (Cashu proofs are powers of 2).
// Kept free of three.js so the 2D UI (onboarding) can use it without loading the 3D bundle.
export const TIERS = [
  { max: 2, face: '#E08A4E', rim: '#B9622C', name: 'copper', range: '1–2' },
  { max: 16, face: '#F5A524', rim: '#C97D0B', name: 'amber', range: '4–16' },
  { max: 128, face: '#FFD23F', rim: '#D9A800', name: 'gold', range: '32–128' },
  { max: 2048, face: '#7BE0AD', rim: '#3FAF78', name: 'mint', range: '256–2,048' },
  { max: Infinity, face: '#B58CFF', rim: '#7E55D6', name: 'grape', range: '4,096+' },
]
export const tierOf = (amount) => TIERS.find((t) => amount <= t.max)

// Same split Cashu uses: an amount becomes one proof per set bit, biggest first.
export function splitPow2(n) {
  const out = []
  for (let b = 0; n > 0; b++, n = Math.floor(n / 2)) if (n % 2) out.push(2 ** b)
  return out.reverse()
}
