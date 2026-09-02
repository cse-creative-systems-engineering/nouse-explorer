import { useEffect, useState } from 'react';
import { nouse, type AppSettings } from '../lib/nouse';

/**
 * First-launch onboarding (plan requirement): requires the Nous API key on
 * first open. Shows once per launch until keys are set; dismissible ("later")
 * but re-prompts on restart until the user provides at least the Nous key.
 */
export function Onboarding() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [nousKey, setNousKey] = useState('');
  const [aaKey, setAaKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const b = nouse();
    if (!b?.settings) {
      setDismissed(true);
      return;
    }
    void b.settings.get().then(setSettings);
  }, []);

  // Once we know settings: hide if Nous key already set
  if (!settings || settings.nousApiKeySet || dismissed) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = nouse();
    if (!b?.settings) return;
    if (!nousKey.trim()) {
      setError('The Nous API key is required to research model profiles.');
      return;
    }
    setError(null);
    const r = await b.settings.setSecret('nous_api_key', nousKey.trim());
    if (aaKey.trim()) await b.settings.setSecret('aa_api_key', aaKey.trim());
    if (r.ok) setSettings(r.view ?? null);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to Nouse Explorer">
      <div className="modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-mark" aria-hidden="true">N</div>
        <h2 className="modal-title" style={{ fontSize: 22 }}>Welcome to Nouse Explorer</h2>
        <p className="modal-desc">
          Every model on the Nous Portal, researched in depth. Add your keys and
          the app will start building cited profiles — strengths, weaknesses,
          and per-use-case signals for all 377+ models.
        </p>

        <form onSubmit={save} className="settings-form">
          <div className="modal-section">
            <h3 className="modal-section-title">Nous Portal API key <span className="settings-unset">(required)</span></h3>
            <p className="settings-hint">
              Powers the research engine's distiller — turns scraped data into
              cited model profiles. Get yours at{' '}
              <a href="https://portal.nousresearch.com" target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>portal.nousresearch.com</a>.
            </p>
            <input
              type="password"
              className="settings-input"
              placeholder="nous-…"
              value={nousKey}
              onChange={(e) => setNousKey(e.target.value)}
              autoFocus
            />
          </div>

          <div className="modal-section">
            <h3 className="modal-section-title">Artificial Analysis API key <span className="settings-set">(optional)</span></h3>
            <p className="settings-hint">
              Unlocks speed, latency, SciCode &amp; MMLU-Pro chips. Free at{' '}
              <a href="https://artificialanalysis.ai" target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>artificialanalysis.ai</a>.
            </p>
            <input
              type="password"
              className="settings-input"
              placeholder="aa-…"
              value={aaKey}
              onChange={(e) => setAaKey(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 10, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.35)', fontSize: 12, color: '#f87171' }}>
              {error}
            </div>
          )}

          <div className="settings-actions">
            <button type="button" className="btn" onClick={() => setDismissed(true)}>
              Later
            </button>
            <button type="submit" className="btn settings-save">
              Start researching
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
