export interface GasQuote {
  chain: string;
  value: number;
  unit: string;
  usd: number;
}

const BASE: GasQuote[] = [
  { chain: 'Ethereum', value: 18, unit: 'gwei', usd: 1.42 },
  { chain: 'Bitcoin', value: 12, unit: 'sat/vB', usd: 1.1 },
  { chain: 'Solana', value: 0.000005, unit: 'SOL', usd: 0.0007 },
  { chain: 'Arbitrum', value: 0.01, unit: 'gwei', usd: 0.02 },
  { chain: 'Base', value: 0.006, unit: 'gwei', usd: 0.01 },
  { chain: 'Polygon', value: 34, unit: 'gwei', usd: 0.006 },
  { chain: 'Avalanche', value: 25, unit: 'nAVAX', usd: 0.04 },
  { chain: 'BNB Chain', value: 1, unit: 'gwei', usd: 0.03 },
];

export function generateGas(rand: () => number = Math.random): GasQuote[] {
  return BASE.map((g) => {
    const k = 0.75 + rand() * 0.5;
    return { ...g, value: g.value * k, usd: g.usd * k };
  });
}
