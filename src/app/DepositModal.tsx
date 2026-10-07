import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Copy, Search, ShieldAlert, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { NumericField } from '@/components/ui/NumericField';
import { DEPOSIT_ASSETS, depositAddress, type DepositAsset, type DepositNetwork } from '@/lib/account/deposit';
import { useUiStore } from '@/stores/useUiStore';
import { useWalletStore } from '@/stores/useWalletStore';
import { ACCOUNT_ID } from '@/stores/useFeeStore';
import { toast } from '@/stores/useToastStore';
import { fmtQty, fmtTime, uid } from '@/lib/format';
import './deposit.css';

/** "Add crypto" — choose asset → network → address (+ memo/tag) with QR and network rules. */
export function DepositModal() {
  const { open, asset: initial } = useUiStore((s) => s.deposit);
  const close = useUiStore((s) => s.closeDeposit);
  const [q, setQ] = useState('');
  const [sym, setSym] = useState('USDT');
  const [netId, setNetId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSym(initial && DEPOSIT_ASSETS.some((a) => a.symbol === initial) ? initial : 'USDT');
      setNetId(null);
      setQ('');
    }
  }, [open, initial]);

  const asset = DEPOSIT_ASSETS.find((a) => a.symbol === sym)!;
  const network = asset.networks.find((n) => n.id === netId) ?? (asset.networks.length === 1 ? asset.networks[0] : null);
  const list = DEPOSIT_ASSETS.filter((a) => !q.trim() || `${a.symbol} ${a.name}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal open={open} onClose={close} title="Add crypto" subtitle="Deposit from an external wallet or exchange. Funds are credited after network confirmations." width={820} testId="deposit-modal">
      <div className="dep-banner" role="note">
        <ShieldAlert size={14} />
        <span>
          <b>Demo environment.</b> Addresses below are simulated and not connected to custody — never send real funds to them.
        </span>
      </div>
      <div className="dep-grid">
        <aside className="dep-assets">
          <span className="input-wrap">
            <Search size={13} className="faint" />
            <input placeholder="Search coin" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search coin" data-autofocus />
          </span>
          <div className="dep-asset-list" role="listbox" aria-label="Coin">
            {list.map((a) => (
              <button
                key={a.symbol}
                role="option"
                aria-selected={a.symbol === sym}
                className={`dep-asset ${a.symbol === sym ? 'on' : ''}`}
                onClick={() => {
                  setSym(a.symbol);
                  setNetId(null);
                }}
                data-testid={`dep-asset-${a.symbol}`}
              >
                <span className="dep-coin">{a.symbol.slice(0, 1)}</span>
                <span className="grow">
                  <span className="dep-sym">{a.symbol}</span>
                  <span className="dep-name">{a.name}</span>
                </span>
                <span className="label">{a.networks.length > 1 ? `${a.networks.length} networks` : a.networks[0].label}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="dep-detail">
          <div className="dep-step">
            <span className="dep-num">1</span> Network
          </div>
          <div className="dep-nets" role="radiogroup" aria-label="Network">
            {asset.networks.map((n) => (
              <button key={n.id} role="radio" aria-checked={network?.id === n.id} className={`dep-net ${network?.id === n.id ? 'on' : ''}`} onClick={() => setNetId(n.id)} data-testid={`dep-net-${n.id}`}>
                <span>{n.label}</span>
                <span className="label">
                  ≈{n.etaMin} min · {n.confirmations} conf.
                </span>
              </button>
            ))}
          </div>
          {network ? <AddressBlock asset={asset} network={network} /> : <div className="dep-choose">Choose the network you’ll send {asset.symbol} on. It must match the sending wallet’s network, or the funds can be lost.</div>}
        </section>
      </div>
    </Modal>
  );
}

function AddressBlock({ asset, network }: { asset: DepositAsset; network: DepositNetwork }) {
  const info = useMemo(() => depositAddress(ACCOUNT_ID, asset.symbol, network), [asset.symbol, network]);
  const [qr, setQr] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(info.address, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16130F', light: '#FFFFFF' } }).then((svg) => live && setQr(svg));
    return () => {
      live = false;
    };
  }, [info.address]);

  return (
    <>
      <div className="dep-step">
        <span className="dep-num">2</span> Send {asset.symbol} to this address
      </div>
      <div className="dep-addr-row">
        <div className="dep-qr" aria-label="Deposit address QR code" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="col grow" style={{ gap: 10 }}>
          <CopyField label={`${asset.symbol} deposit address · ${network.label}`} value={info.address} testId="dep-address" />
          {info.memo && <CopyField label={`${info.memo.label} (required)`} value={info.memo.value} warn testId="dep-memo" />}
          <ul className="dep-rules">
            <li>
              <AlertTriangle size={12} /> Send only <b>{asset.symbol}</b> on <b>{network.label}</b>. Other assets or networks sent here may be lost.
            </li>
            {info.memo && (
              <li>
                <AlertTriangle size={12} /> Include the {info.memo.label.toLowerCase()} — without it the deposit can’t be matched to your account.
              </li>
            )}
            <li>
              Minimum deposit <b className="mono">{fmtQty(asset.minDeposit)} {asset.symbol}</b> · credited after <b>{network.confirmations}</b> confirmation{network.confirmations > 1 ? 's' : ''} (≈{network.etaMin} min) · no deposit fee
            </li>
          </ul>
        </div>
      </div>
      <SimulateDeposit asset={asset} network={network} />
    </>
  );
}

function CopyField({ label, value, warn, testId }: { label: string; value: string; warn?: boolean; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span className={`label ${warn ? 'warn-text' : ''}`}>{label}</span>
      <div className={`dep-copy ${warn ? 'warn' : ''}`}>
        <span className="mono dep-value" data-testid={testId}>
          {value}
        </span>
        <button
          className="btn sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
            } catch {
              /* clipboard may be blocked; still show feedback */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** Demo-only: simulate an inbound transfer confirming on-chain and being credited. */
function SimulateDeposit({ asset, network }: { asset: DepositAsset; network: DepositNetwork }) {
  const [amount, setAmount] = useState(asset.symbol === 'USDT' || asset.symbol === 'USDC' ? 1000 : asset.minDeposit * 20);
  const deposits = useWalletStore((s) => s.deposits);
  useEffect(() => {
    setAmount(asset.symbol === 'USDT' || asset.symbol === 'USDC' ? 1000 : +(asset.minDeposit * 20).toPrecision(3));
  }, [asset.symbol, asset.minDeposit]);
  const below = amount < asset.minDeposit;

  const run = () => {
    const w = useWalletStore.getState();
    const rec = { id: uid('dep_'), asset: asset.symbol, network: network.label, amount, confirmations: 0, required: network.confirmations, status: 'confirming' as const, createdAt: Date.now() };
    w.upsertDeposit(rec);
    toast({ kind: 'info', title: 'Deposit detected', detail: `${fmtQty(amount)} ${asset.symbol} on ${network.label} · confirming` });
    // Compress real confirmation time into ~3s for the demo.
    const steps = Math.min(network.confirmations, 6);
    let k = 0;
    const t = setInterval(() => {
      k++;
      const conf = k >= steps ? network.confirmations : Math.round((k / steps) * network.confirmations);
      if (k >= steps) {
        clearInterval(t);
        useWalletStore.getState().upsertDeposit({ ...rec, confirmations: conf, status: 'credited' });
        useWalletStore.getState().credit(asset.symbol, amount);
        toast({ kind: 'success', title: 'Deposit credited', detail: `${fmtQty(amount)} ${asset.symbol}${asset.symbol === 'USDT' ? ' to trading balance' : ' to holdings'}` });
      } else useWalletStore.getState().upsertDeposit({ ...rec, confirmations: conf });
    }, 500);
  };

  const recent = deposits.slice(0, 3);
  return (
    <div className="dep-sim">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <NumericField label={`Simulate an incoming transfer (demo)`} value={amount} onCommit={setAmount} suffix={asset.symbol} ariaLabel="Simulated deposit amount" testId="dep-sim-amount" />
        </div>
        <button className="btn primary" onClick={run} disabled={below} data-testid="dep-simulate">
          Simulate deposit
        </button>
      </div>
      {below && <span className="error-text">Below the minimum deposit of {fmtQty(asset.minDeposit)} {asset.symbol}</span>}
      {recent.length > 0 && (
        <div className="dep-history">
          {recent.map((d) => (
            <div key={d.id} className="dep-hist-row" data-testid="dep-history-row">
              <span className="num faint">{fmtTime(d.createdAt, false)}</span>
              <span className="mono">
                {fmtQty(d.amount)} {d.asset}
              </span>
              <span className="faint">{d.network}</span>
              <span className="spacer" />
              {d.status === 'credited' ? (
                <span className="badge accent">
                  <Check size={10} /> Credited
                </span>
              ) : (
                <span className="badge neutral">
                  <Loader2 size={10} className="spin" /> {d.confirmations}/{d.required}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
