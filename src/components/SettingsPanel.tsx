import { useEffect, useState } from 'react';
import { nouse, type AppSettings } from '../lib/nouse';

const DISTILLER_OPTIONS = [
  'inclusionai/ling-3.0-flash-fin:free',
  'upstage/solar-pro4:free',
  'stepfun/step-3.7-flash:free',
  'poolside/laguna-s-2.1:free',
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [nousKey, setNousKey] = useState('');
  const [aaKey, setAaKey] = useState('');
  const [distiller, setDistiller] = useState(DISTILLER_OPTIONS[0]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = nouse();
    if (!b?.settings) return;
    void b.settings.get().then((s) => {
      setSettings(s);
      setDistiller(s.distillerModel);
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = nouse();
    if (!b?.settings) return;
    if (nousKey.trim()) await b.settings.setSecret('nous_api_key', nousKey.trim());
    if (aaKey.trim()) await b.settings.setSecret('aa_api_key', aaKey.trim());
    await b.settings.setDistiller(distiller);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    const fresh = await b.settings.get();
    setSettings(fresh);
    setNousKey('');
    setAaKey('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title">Settings</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close settings" style={{ marginLeft: 'auto' }}>
            ✕
          </button>
        </header>

        <form onSubmit={save} className="settings-form">
          <div className="modal-section">
            <h3 className="modal-section-title">Nous Portal API key</h3>
            <p className="settings-hint">
              Used by the research engine's distiller (Tier-3 qualitative profiling).
              {settings?.nousApiKeySet ? (
                <span className="settings-set"> Set — {settings.nousApiKeyMasked}</span>
              ) : (
                <span className="settings-unset"> Not set yet</span>
              )}
            </p>
            <input
              type="password"
              className="settings-input"
              placeholder="nous-…"
              value={nousKey}
              onChange={(e) => setNousKey(e.target.value)}
            />
          </div>

          <div className="modal-section">
            <h3 className="modal-section-title">Artificial Analysis API key</h3>
            <p className="settings-hint">
              Unlocks speed, latency, SciCode, LiveCodeBench &amp; MMLU-Pro data (the dashed “waiting for research” chips).
              {settings?.aaApiKeySet ? (
                <span className="settings-set"> Set — {settings.aaApiKeyMasked}</span>
              ) : (
                <span className="settings-unset"> Not set yet</span>
              )}
            </p>
            <input
              type="password"
              className="settings-input"
              placeholder="aa-…"
              value={aaKey}
              onChange={(e) => setAaKey(e.target.value)}
            />
          </div>

          <div className="modal-section">
            <h3 className="modal-section-title">Research distiller model</h3>
            <p className="settings-hint">Free Nous model used to distill scraped text into cited profile claims.</p>
            <select
              className="settings-input settings-select"
              value={distiller}
              onChange={(e) => setDistiller(e.target.value)}
            >
              {DISTILLER_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="settings-actions">
            <span className={`settings-saved${saved ? ' show' : ''}`}>✓ Saved — research will pick this up</span>
            <button type="submit" className="btn settings-save">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
