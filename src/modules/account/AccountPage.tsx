import { useState } from 'react';
import { BadgePercent, Check, Copy, Plus, ShieldCheck, Ban, KeyRound, ArrowRightLeft } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { NumericField } from '@/components/ui/NumericField';
import { useWalletStore } from '@/stores/useWalletStore';
import { usePositionStore, committedNotional } from '@/stores/usePositionStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useFeeStore } from '@/stores/useFeeStore';
import { useUiStore } from '@/stores/useUiStore';
import { priceOf, STABLES, useHoldingsValue } from '@/stores/useHoldingsValue';
import { toast } from '@/stores/useToastStore';
import { FEE_TIERS, feeFor, fmtRate, takerDiscountPct, type TierId } from '@/lib/account/fees';
import { checkFormat, codeStatus, type PartnerTier } from '@/lib/account/partnerCodes';
import { fmtDate, fmtPrice, fmtQty, fmtTime, fmtUsd } from '@/lib/format';
import './account.css';

export function AccountPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <p>Balances, deposits, your fee tier and partner programme.</p>
        </div>
      </div>
      <div className="acct-grid">
        <Balances />
        <FeeTier />
        <Deposits />
        <PartnerConsole />
      </div>
    </div>
  );
}

function Balances() {
  const balance = useWalletStore((s) => s.balance);
  const holdings = useWalletStore((s) => s.holdings);
  const positions = usePositionStore((s) => s.positions);
  const assets = useMarketStore((s) => s.assets);
  const holdingsValue = useHoldingsValue();
  const tier = useFeeStore((s) => s.tier);
  const committed = committedNotional(positions);
  const rows = Object.entries(holdings).filter(([, q]) => q > 0);

  const convert = (sym: string, qty: number) => {
    const px = STABLES.has(sym) ? 1 : assets[sym].bid;
    const gross = qty * px;
    const fee = feeFor(gross, tier, 'taker');
    if (useWalletStore.getState().convert(sym, qty, gross - fee)) {
      toast({ kind: 'success', title: `Converted ${sym} → USDT`, detail: `${fmtQty(qty)} ${sym} @ ${fmtPrice(px)} = ${fmtUsd(gross - fee)} USDT · fee ${fmtUsd(fee)}` });
    }
  };

  return (
    <Panel
      title="Balances"
      testId="balances"
      actions={
        <button className="btn sm primary" onClick={() => useUiStore.getState().openDeposit()}>
          <Plus size={12} /> Add crypto
        </button>
      }
    >
      <div className="bal-summary">
        <div>
          <span className="label">Total value</span>
          <span className="bal-big mono">${fmtUsd(balance + committed + holdingsValue)}</span>
        </div>
        <div>
          <span className="label">USDT available</span>
          <span className="mono">{fmtUsd(balance)}</span>
        </div>
        <div>
          <span className="label">In positions</span>
          <span className="mono">{fmtUsd(committed)}</span>
        </div>
        <div>
          <span className="label">Crypto holdings</span>
          <span className="mono">{fmtUsd(holdingsValue)}</span>
        </div>
      </div>
      <table className="table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Asset</th>
            <th className="r">Amount</th>
            <th className="r">Price</th>
            <th className="r">Value (USD)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">USDT</td>
            <td className="r num">{fmtUsd(balance)}</td>
            <td className="r num faint">1.00</td>
            <td className="r num">{fmtUsd(balance)}</td>
            <td className="r label">trading balance</td>
          </tr>
          {rows.map(([sym, qty]) => (
            <tr key={sym} data-testid={`holding-${sym}`}>
              <td className="mono">{sym}</td>
              <td className="r num">{fmtQty(qty)}</td>
              <td className="r num">{fmtPrice(priceOf(sym, assets))}</td>
              <td className="r num">{fmtUsd(qty * priceOf(sym, assets))}</td>
              <td className="r">
                <button className="btn sm" onClick={() => convert(sym, qty)} title={`Sell at the bid into USDT (taker ${fmtRate(FEE_TIERS[tier].taker)})`}>
                  <ArrowRightLeft size={12} /> Convert to USDT
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">No crypto holdings yet — use “Add crypto” to deposit.</div>}
    </Panel>
  );
}

function FeeTier() {
  const { tier, appliedCode, feesPaid, rebatesEarned, redeem, removeCode } = useFeeStore();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fmt = code.trim() ? checkFormat(code) : null;
  const t = FEE_TIERS[tier];

  const submit = () => {
    const r = redeem(code);
    if (r.ok) {
      setMsg({ ok: true, text: `Applied — ${FEE_TIERS[r.tier].label} tier via ${r.partner}` });
      toast({ kind: 'success', title: 'Partner code applied', detail: `${FEE_TIERS[r.tier].label} fees: taker ${fmtRate(FEE_TIERS[r.tier].taker)}` });
      setCode('');
    } else setMsg({ ok: false, text: r.error });
  };

  return (
    <Panel title="Fees & partner programme" testId="fee-tier">
      <div className="tier-card">
        <div className="tier-icon">
          <BadgePercent size={18} />
        </div>
        <div className="grow">
          <div className="tier-name" data-testid="current-tier">
            {t.label}
          </div>
          <div className="label">{t.blurb}</div>
        </div>
        <div className="tier-rates">
          <div>
            <span className="label">Maker</span>
            <span className={`mono ${t.maker < 0 ? 'up' : ''}`}>{fmtRate(t.maker)}</span>
          </div>
          <div>
            <span className="label">Taker</span>
            <span className="mono">{fmtRate(t.taker)}</span>
          </div>
        </div>
      </div>
      <div className="row tier-stats">
        <span className="label">Fees paid</span>
        <span className="mono">{fmtUsd(feesPaid)} USDT</span>
        <span className="label" style={{ marginLeft: 12 }}>
          Rebates earned
        </span>
        <span className="mono up">{fmtUsd(rebatesEarned)} USDT</span>
      </div>

      {appliedCode ? (
        <div className="applied">
          <ShieldCheck size={14} className="up" />
          <span className="grow">
            Code <span className="mono">{appliedCode.code}</span> from <b>{appliedCode.partner}</b> · applied {fmtDate(appliedCode.at)}
          </span>
          <button className="btn sm ghost" onClick={removeCode}>
            Remove
          </button>
        </div>
      ) : (
        <form
          className="redeem"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="label">Have a partner or liquidity-provider code?</span>
          <div className="row">
            <span className={`input-wrap grow ${fmt && !fmt.ok ? 'invalid' : ''}`}>
              <KeyRound size={13} className="faint" />
              <input
                placeholder="LP-XXXX-XXXX or PT-XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setMsg(null);
                }}
                aria-label="Partner code"
                spellCheck={false}
                autoComplete="off"
                data-testid="partner-code-input"
              />
              {fmt?.ok && <span className="suffix">{fmt.tier === 'lp' ? 'LP code' : 'Partner code'}</span>}
            </span>
            <button className="btn primary" type="submit" disabled={!fmt?.ok} data-testid="redeem-code">
              Apply
            </button>
          </div>
          {fmt && !fmt.ok && <span className="error-text">{fmt.error}</span>}
          {msg && <span className={msg.ok ? 'up' : 'error-text'} data-testid="redeem-msg">{msg.text}</span>}
        </form>
      )}

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Tier</th>
            <th className="r">Maker</th>
            <th className="r">Taker</th>
            <th className="r">vs Standard</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(FEE_TIERS) as TierId[]).map((id) => (
            <tr key={id} className={id === tier ? 'selected' : ''}>
              <td>
                {FEE_TIERS[id].label}
                {id === tier && <span className="badge accent" style={{ marginLeft: 6 }}>current</span>}
              </td>
              <td className={`r num ${FEE_TIERS[id].maker < 0 ? 'up' : ''}`}>{fmtRate(FEE_TIERS[id].maker)}</td>
              <td className="r num">{fmtRate(FEE_TIERS[id].taker)}</td>
              <td className="r num">{id === 'standard' ? '—' : `−${takerDiscountPct(id).toFixed(0)}% taker`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="label" style={{ margin: '8px 0 0' }}>
        Market and marketable orders pay taker; resting limit orders that fill pay maker (a rebate on the LP tier).
      </p>
    </Panel>
  );
}

function Deposits() {
  const deposits = useWalletStore((s) => s.deposits);
  return (
    <Panel title="Deposit history" flush testId="deposit-history">
      {deposits.length === 0 ? (
        <div className="empty">No deposits yet.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Asset</th>
              <th>Network</th>
              <th className="r">Amount</th>
              <th className="r">Status</th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id}>
                <td className="num faint">
                  {fmtDate(d.createdAt).slice(5)} {fmtTime(d.createdAt, false)}
                </td>
                <td className="mono">{d.asset}</td>
                <td className="dim">{d.network}</td>
                <td className="r num">{fmtQty(d.amount)}</td>
                <td className="r">{d.status === 'credited' ? <span className="badge accent">Credited</span> : <span className="badge neutral">{d.confirmations}/{d.required} conf.</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/** Operator view for issuing codes to partners/LPs. Server-side + permissioned in production. */
function PartnerConsole() {
  const { registry, issue, revoke } = useFeeStore();
  const [partner, setPartner] = useState('');
  const [tier, setTier] = useState<PartnerTier>('lp');
  const [maxUses, setMaxUses] = useState(25);
  const [days, setDays] = useState(90);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (c: string) => {
    try {
      await navigator.clipboard.writeText(c);
    } catch {
      /* ignore */
    }
    setCopied(c);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <Panel title="Partner codes" sub="internal · issuance" className="acct-console" testId="partner-console">
      <p className="label" style={{ margin: '0 0 10px' }}>
        Issue codes to liquidity providers and partners. Each account can redeem a code once; codes can be capped, time-limited and revoked. In production this
        console is permissioned and codes are issued and validated server-side.
      </p>
      <form
        className="issue-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!partner.trim()) return;
          const c = issue({ tier, partner, maxUses: Math.max(1, Math.round(maxUses)), expiresInDays: days > 0 ? Math.round(days) : null });
          setFresh(c.code);
          setPartner('');
          toast({ kind: 'success', title: 'Code issued', detail: `${c.code} → ${c.partner}` });
        }}
      >
        <label className="field grow">
          <span className="label">Partner / organisation</span>
          <input className="input" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="e.g. Meridian Liquidity" data-testid="issue-partner" />
        </label>
        <div className="field">
          <span className="label">Programme</span>
          <Segmented<PartnerTier>
            value={tier}
            onChange={setTier}
            ariaLabel="Programme"
            options={[
              { value: 'lp', label: 'Liquidity provider' },
              { value: 'partner', label: 'Partner' },
            ]}
          />
        </div>
        <div style={{ width: 96 }}>
          <NumericField label="Max uses" value={maxUses} min={1} onCommit={setMaxUses} ariaLabel="Max uses" />
        </div>
        <div style={{ width: 110 }}>
          <NumericField label="Expires (days)" value={days} min={0} onCommit={setDays} ariaLabel="Expiry days" hint="0 = never" />
        </div>
        <button className="btn primary" type="submit" disabled={!partner.trim()} data-testid="issue-code">
          Issue code
        </button>
      </form>
      {fresh && (
        <div className="fresh-code" data-testid="fresh-code">
          <span className="label">New code</span>
          <span className="mono">{fresh}</span>
          <button className="btn sm" onClick={() => copy(fresh)}>
            {copied === fresh ? <Check size={12} /> : <Copy size={12} />} Copy
          </button>
        </div>
      )}
      <table className="table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Partner</th>
            <th>Programme</th>
            <th className="r">Uses</th>
            <th>Expires</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {registry.map((c) => {
            const st = codeStatus(c);
            return (
              <tr key={c.code} data-testid="registry-row">
                <td>
                  <button className="code-btn mono" onClick={() => copy(c.code)} title="Copy">
                    {c.code} {copied === c.code ? <Check size={11} /> : <Copy size={11} className="faint" />}
                  </button>
                </td>
                <td>{c.partner}</td>
                <td>{c.tier === 'lp' ? 'Liquidity provider' : 'Partner'}</td>
                <td className="r num">
                  {c.uses}/{c.maxUses}
                </td>
                <td className="num faint">{c.expiresAt ? fmtDate(c.expiresAt) : 'never'}</td>
                <td>
                  <span className={`badge ${st === 'active' ? 'accent' : 'neutral'}`}>{st}</span>
                </td>
                <td className="r">
                  {!c.revoked && (
                    <button className="btn sm ghost danger" onClick={() => revoke(c.code)}>
                      <Ban size={11} /> Revoke
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
