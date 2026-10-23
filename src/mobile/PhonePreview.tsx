import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { MonitorSmartphone, Smartphone } from 'lucide-react';
import { Wordmark } from '@/app/Logo';
import { useThemeStore } from '@/stores/useThemeStore';
import { MobileApp } from './MobileApp';

/**
 * Desktop "Mobile" layout: the real phone app running inside a phone frame, with a QR code to open
 * it on an actual phone. On a phone-sized screen the app goes full screen by itself.
 */
export function PhonePreview() {
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof location !== 'undefined' ? `${location.origin}/watchlist` : '';
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 168, color: { dark: '#16130f', light: '#f4f4f0' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);
  return (
    <div className="phone-stage" data-testid="phone-preview">
      <div className="phone-frame">
        <span className="phone-island" aria-hidden />
        <MobileApp framed />
      </div>
      <aside className="phone-aside">
        <Wordmark height={18} />
        <h2>
          <Smartphone size={18} /> Phone app
        </h2>
        <p>
          This is Aztex on a phone — <b>Quotes</b>, a full-screen <b>Chart</b> (drag to pan, pinch to zoom, long-press for the crosshair), <b>Trade</b>, <b>History</b> and <b>Menu</b>, with MT5-style order and position sheets.
        </p>
        <p className="faint">Open it on your phone and use Share › Add to Home Screen to install it like an app.</p>
        {qr && <img className="phone-qr" src={qr} alt={`QR code for ${url}`} width={168} height={168} />}
        <span className="mono faint phone-url">{url}</span>
        <button className="btn" onClick={() => useThemeStore.getState().setPlatform('website')} data-testid="exit-phone-preview">
          <MonitorSmartphone size={14} /> Back to desktop layout
        </button>
      </aside>
    </div>
  );
}
