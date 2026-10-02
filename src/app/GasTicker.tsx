import { useEffect, useState } from 'react';
import { Fuel } from 'lucide-react';
import { generateGas, type GasQuote } from '@/lib/mock/gas';

function fmtGas(g: GasQuote) {
  const v = g.value < 0.01 ? g.value.toPrecision(2) : g.value < 10 ? g.value.toFixed(2) : g.value.toFixed(0);
  return `${v} ${g.unit}`;
}

export function GasTicker() {
  const [gas, setGas] = useState(() => generateGas());
  useEffect(() => {
    const t = setInterval(() => setGas(generateGas()), 8000);
    return () => clearInterval(t);
  }, []);
  const items = (suffix: string) =>
    gas.map((g) => (
    <span key={g.chain + suffix} className="gas-item" aria-hidden={suffix ? true : undefined}>
      <span className="dim">{g.chain}</span>
      <span className="num">{fmtGas(g)}</span>
      <span className="num faint">≈ ${g.usd < 0.01 ? g.usd.toFixed(4) : g.usd.toFixed(2)}</span>
    </span>
    ));
  return (
    <div className="gas-ticker no-select" aria-label="Network fee estimates">
      <span className="gas-label">
        <Fuel size={12} /> Fees
      </span>
      <div className="gas-track">
        <div className="gas-run">
          {items('')}
          {items('-dup')}
        </div>
      </div>
    </div>
  );
}
