import { useMemo } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';

/** 24h closes with the live price appended, plus the 24h high/low they span. */
export function useSpark(symbol: string) {
  const spark = useMarketStore((s) => s.sparks[symbol]);
  const price = useMarketStore((s) => s.assets[symbol]?.price);
  return useMemo(() => {
    const values = spark && price != null ? [...spark, price] : (spark ?? []);
    if (values.length === 0) return { values, high: null as number | null, low: null as number | null };
    return { values, high: Math.max(...values), low: Math.min(...values) };
  }, [spark, price]);
}
