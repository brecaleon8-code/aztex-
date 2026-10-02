import { useEffect, useState } from 'react';
import { generateGas, type GasQuote } from '@/lib/mock/gas';

function fmtGas(g: GasQuote) {
  const v = g.value < 0.01 ? g.value.toPrecision(2) : g.value < 10 ? g.value.toFixed(2) : g.value.toFixed(0);
  return `${v} ${g.unit}`;
}

/** Network fee estimates — compact static cells, rotating through chains. */
export function GasTicker() {
  const [gas, setGas] = useState(() => generateGas());
  useEffect(() => {
    const t = setInterval(() => setGas(generateGas()), 8000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="gas" aria-label="Network fee estimates">
      <span className="label">Fees</span>
      {gas.slice(0, 3).map((g) => (
        <span key={g.chain} className="gas-item" title={`${g.chain}: ≈ $${g.usd.toFixed(4)}`}>
          <span className="faint">{g.chain}</span> <span className="mono">{fmtGas(g)}</span>
        </span>
      ))}
    </div>
  );
}
