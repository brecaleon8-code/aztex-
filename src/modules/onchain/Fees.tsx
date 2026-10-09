import { Bell } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { useOnchainStore } from '@/stores/useOnchainStore';
import { median } from '@/lib/onchain/alerts';
import { NETWORK } from '@/lib/onchain/networks';
import { FEE_NETWORKS } from '@/lib/onchain/sim';
import { toast } from '@/stores/useToastStore';
import { NetBadge } from './common';

const fmtFee = (v: number) => (v < 0.001 ? v.toExponential(1) : v < 1 ? v.toPrecision(2) : v < 10 ? v.toFixed(2) : v.toFixed(0));

/** Network fees vs their recent median; one click arms a spike alert. */
export function FeeMonitor() {
  const fees = useOnchainStore((s) => s.fees);
  return (
    <Panel title="Network fees" sub="vs 5-min median" flush testId="oc-fees">
      <div className="oc-fees">
        {FEE_NETWORKS.map((id) => {
          const xs = fees[id] ?? [];
          const last = xs[xs.length - 1]?.value;
          const med = median(xs.slice(-60, -1).map((x) => x.value));
          const pct = last != null && med ? (last / med - 1) * 100 : null;
          const spike = pct != null && pct >= 100;
          return (
            <div key={id} className={`oc-fee ${spike ? 'spike' : ''}`} data-testid="oc-fee-row">
              <NetBadge id={id} />
              <Spark values={xs.slice(-60).map((x) => x.value)} />
              <span className="num oc-fee-v">
                {last != null ? fmtFee(last) : '—'} <span className="faint">{NETWORK[id].feeUnit}</span>
              </span>
              <span className={`num oc-fee-pct ${pct != null && pct > 25 ? 'down' : 'faint'}`}>{pct == null ? '' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`}</span>
              {spike && <span className="oc-spike">Spike</span>}
              <button
                className="oc-icon"
                title="Alert when fees spike 100% above the median"
                aria-label={`Fee spike alert for ${NETWORK[id].name}`}
                onClick={() => {
                  useOnchainStore.getState().addRule({ kind: 'fee_spike', network: id, mode: 'pct', value: 100 });
                  toast({ kind: 'success', title: 'Fee alert added', detail: `${NETWORK[id].name}: +100% over the rolling median` });
                }}
              >
                <Bell size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Spark({ values }: { values: number[] }) {
  const W = 90;
  const H = 22;
  if (values.length < 2) return <svg width={W} height={H} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)).toFixed(1)}`).join('');
  return (
    <svg width={W} height={H} className="oc-spark" aria-hidden>
      <path d={d} fill="none" stroke="var(--series)" strokeWidth={1.5} />
    </svg>
  );
}
