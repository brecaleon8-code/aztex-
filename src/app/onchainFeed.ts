import { useOnchainStore } from '@/stores/useOnchainStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { toast } from '@/stores/useToastStore';
import { classifyTransfer } from '@/lib/onchain/flows';
import { matchActivity, matchFee, matchTransfer, recordActivity, tokenKey, type AlertHit } from '@/lib/onchain/alerts';
import { FEE_NETWORKS, simBurst, simFee, simLabels, simTransfer } from '@/lib/onchain/sim';
import type { ChainTransfer, FeeSample } from '@/lib/onchain/types';
import { uid } from '@/lib/format';

/**
 * Simulated on-chain stream (large transfers, fees) wired to the alert engine. Runs app-wide so
 * alerts fire on any page. Production replaces the generators with an indexer / mempool socket
 * pushing the same ChainTransfer / FeeSample shapes.
 */
export function startOnchainFeed(): () => void {
  const st = useOnchainStore.getState;
  const prices = () => Object.fromEntries(Object.values(useMarketStore.getState().assets).map((a) => [a.symbol, a.price]));
  const sim = simLabels();
  const labels = () => [...st().labels, ...sim];

  const ingest = (raw: ChainTransfer[], quiet = false) => {
    const ts = raw.map((t) => classifyTransfer(t, labels()));
    st().addTransfers(ts);
    if (quiet) return;
    const hits: AlertHit[] = [];
    let activity = st().activity;
    for (const t of ts) {
      for (const r of st().rules) {
        const h = matchTransfer(r, t);
        if (h) hits.push({ ...h, id: uid('oah_'), ruleId: r.id });
      }
      const res = recordActivity(activity, tokenKey(t.network, t.token.address, t.token.symbol), t.time, t.usd);
      activity = res.state;
      for (const b of res.closed) for (const r of st().rules) {
        const h = matchActivity(r, b);
        if (h) hits.push({ ...h, id: uid('oah_'), ruleId: r.id });
      }
    }
    st().setActivity(activity);
    report(hits);
  };

  const sampleFees = (now = Date.now(), quiet = false) => {
    const samples: FeeSample[] = FEE_NETWORKS.map((n) => {
      const prev = st().fees[n];
      return simFee(n, prev?.length ? prev[prev.length - 1].value : null, Math.random, now);
    });
    const hits: AlertHit[] = [];
    if (!quiet)
      for (const s of samples)
        for (const r of st().rules) {
          const h = matchFee(r, s, st().fees[s.network] ?? []);
          if (h) hits.push({ ...h, id: uid('oah_'), ruleId: r.id });
        }
    st().addFees(samples);
    report(hits);
  };

  const report = (hits: AlertHit[]) => {
    if (!hits.length) return;
    st().addHits(hits);
    for (const h of hits.slice(0, 3)) toast({ kind: 'info', title: `On-chain alert · ${h.title}`, detail: h.detail });
  };

  // Seed: an hour of history and a few minutes of fees, without firing alerts.
  if (st().transfers.length === 0) {
    const now = Date.now();
    ingest(
      Array.from({ length: 60 }, (_, i) => simTransfer(prices(), Math.random, now - (60 - i) * 58_000)),
      true,
    );
    for (let i = 40; i > 0; i--) sampleFees(now - i * 5000, true);
  }

  let t: ReturnType<typeof setTimeout>;
  const loop = () => {
    ingest(Math.random() < 0.035 ? simBurst(prices()) : [simTransfer(prices())]);
    t = setTimeout(loop, 1200 + Math.random() * 1800);
  };
  t = setTimeout(loop, 1000);
  const fees = setInterval(() => sampleFees(), 5000);
  return () => {
    clearTimeout(t);
    clearInterval(fees);
  };
}
