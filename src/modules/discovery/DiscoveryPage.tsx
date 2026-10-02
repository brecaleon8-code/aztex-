import { CurrencySearch } from './CurrencySearch';
import { MarketShare } from './MarketShare';
import { ComparisonChart } from './ComparisonChart';
import { Scanner } from './Scanner';
import './discovery.css';

export function DiscoveryPage() {
  return (
    <div className="discovery">
      <div className="page-head">
        <div>
          <h1>Data &amp; Discovery</h1>
          <p>Dominance, relative performance and on-chain flow across the asset universe.</p>
        </div>
        <span className="spacer" />
        <CurrencySearch />
      </div>
      <div className="disc-grid">
        <MarketShare />
        <ComparisonChart />
        <Scanner />
      </div>
    </div>
  );
}
