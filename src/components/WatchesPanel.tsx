import { useEffect, useState } from 'react';
import { nouse, type AlertRecord, type Watch } from '../lib/nouse';
import { $models } from '../lib/store';
import { useStore } from '@nanostores/react';

const TYPE_LABELS: Record<string, string> = {
  price_drop: 'PRICE DROP',
  price_increase: 'PRICE UP',
  discount_appeared: 'DISCOUNT',
  discount_disappeared: 'DISCOUNT ENDED',
  new_model: 'NEW MODEL',
  removed_model: 'REMOVED',
};

export function WatchesPanel({ onClose }: { onClose: () => void }) {
  const models = useStore($models);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [history, setHistory] = useState<AlertRecord[]>([]);
  const [tab, setTab] = useState<'watches' | 'history'>('watches');

  // create form
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [modelId, setModelId] = useState('');
  const [priceDrop, setPriceDrop] = useState(10);
  const [priceUp, setPriceUp] = useState(10);
  const [discountAppears, setDiscountAppears] = useState(false);
  const [discountEnds, setDiscountEnds] = useState(false);
  const [newModel, setNewModel] = useState(false);
  const [removedModel, setRemovedModel] = useState(false);

  const providers = [...new Set(models.map((m) => m.id.split('/')[0]))].sort();

  const reload = () => {
    const b = nouse();
    if (!b?.alerts) return;
    void b.alerts.list().then(setWatches);
    void b.alerts.history().then(setHistory);
  };

  useEffect(() => {
    reload();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = nouse();
    if (!b?.alerts) return;
    const watch = await b.alerts.create({
      name: name.trim() || (provider ? `${provider} watch` : modelId.split('/')[0] || 'watch'),
      model_ids: modelId.trim() ? [modelId.trim()] : [],
      provider: provider || null,
      conditions: {
        price_drop_percent: priceDrop > 0 ? priceDrop : undefined,
        price_increase_percent: priceUp > 0 ? priceUp : undefined,
        discount_appears: discountAppears || undefined,
        discount_disappears: discountEnds || undefined,
        new_model: newModel || undefined,
        removed_model: removedModel || undefined,
      },
      notify_desktop: true,
      active: true,
    });
    if (watch) {
      setName(''); setProvider(''); setModelId('');
      setDiscountAppears(false); setDiscountEnds(false); setNewModel(false); setRemovedModel(false);
      await b.alerts.setCatalog(models);
      reload();
    }
  };

  const toggle = async (w: Watch) => {
    const b = nouse();
    if (!b?.alerts) return;
    setWatches(await b.alerts.update(w.id, { active: !w.active }));
  };

  const remove = async (w: Watch) => {
    const b = nouse();
    if (!b?.alerts) return;
    setWatches(await b.alerts.remove(w.id));
  };

  const checkNow = async () => {
    const b = nouse();
    if (!b?.alerts) return;
    await b.alerts.setCatalog(models);
    await b.alerts.checkNow();
    reload();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Alerts & watches">
      <div className="modal watches-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title">Alerts</h2>
          <div className="vt" style={{ marginLeft: 'auto' }}>
            <button type="button" className={tab === 'watches' ? 'on' : ''} onClick={() => setTab('watches')}>Watches</button>
            <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button>
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close alerts" style={{ marginLeft: 8 }}>✕</button>
        </header>

        {tab === 'watches' ? (
          <>
            <form onSubmit={create} className="watch-form">
              <div className="watch-row">
                <input className="settings-input" placeholder="Watch name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="watch-row">
                <select className="settings-input settings-select" value={provider} onChange={(e) => setProvider(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Watch a whole provider…</option>
                  {providers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>or</span>
                <input className="settings-input" placeholder="specific model id (e.g. z-ai/glm-5.3-flash)" value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ flex: 2 }} />
              </div>
              <div className="watch-row watch-conds">
                <label className="watch-cond">
                  <span>Price drops ≥</span>
                  <input type="number" min={1} max={100} value={priceDrop} onChange={(e) => setPriceDrop(+e.target.value)} />%
                </label>
                <label className="watch-cond">
                  <span>Price rises ≥</span>
                  <input type="number" min={1} max={100} value={priceUp} onChange={(e) => setPriceUp(+e.target.value)} />%
                </label>
              </div>
              <div className="watch-row watch-conds">
                <label className="watch-check"><input type="checkbox" checked={discountAppears} onChange={(e) => setDiscountAppears(e.target.checked)} /> Discount appears</label>
                <label className="watch-check"><input type="checkbox" checked={discountEnds} onChange={(e) => setDiscountEnds(e.target.checked)} /> Discount ends</label>
                <label className="watch-check"><input type="checkbox" checked={newModel} onChange={(e) => setNewModel(e.target.checked)} /> New models</label>
                <label className="watch-check"><input type="checkbox" checked={removedModel} onChange={(e) => setRemovedModel(e.target.checked)} /> Removed models</label>
              </div>
              <div className="watch-actions">
                <button type="submit" className="btn settings-save">Create watch</button>
                <button type="button" className="btn" onClick={checkNow} title="Run a check now against live prices">Check now</button>
              </div>
            </form>

            <div className="watch-list">
              {watches.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
                  No watches yet — create one above. Watches check every 30 min and fire desktop notifications.
                </div>
              )}
              {watches.map((w) => (
                <div key={w.id} className={`watch-item${w.active ? '' : ' off'}`}>
                  <div className="watch-item-info">
                    <div className="watch-item-name">{w.name}</div>
                    <div className="watch-item-scope">
                      {w.provider ? `provider: ${w.provider}` : w.model_ids.join(', ')}
                    </div>
                    <div className="watch-item-conds">
                      {w.conditions.price_drop_percent ? `drop≥${w.conditions.price_drop_percent}% ` : ''}
                      {w.conditions.price_increase_percent ? `up≥${w.conditions.price_increase_percent}% ` : ''}
                      {w.conditions.discount_appears ? 'discount·' : ''}
                      {w.conditions.discount_disappears ? 'disc-end·' : ''}
                      {w.conditions.new_model ? 'new·' : ''}
                      {w.conditions.removed_model ? 'removed' : ''}
                    </div>
                  </div>
                  <div className="watch-item-actions">
                    <button type="button" className={`btn btn-sm${w.active ? '' : ' muted'}`} onClick={() => toggle(w)}>
                      {w.active ? 'On' : 'Off'}
                    </button>
                    <button type="button" className="btn btn-sm danger" onClick={() => remove(w)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="watch-list">
            {history.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
                No alerts fired yet.
              </div>
            )}
            {history.map((h, i) => (
              <div key={i} className="history-item">
                <span className={`history-type ${h.type}`}>{TYPE_LABELS[h.type] ?? h.type}</span>
                <span className="history-msg">{h.message}</span>
                <span className="history-time">{new Date(h.timestamp).toLocaleString()}</span>
              </div>
            ))}
            {history.length > 0 && (
              <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => { void nouse()?.alerts.ack().then(setHistory); }}>
                Acknowledge all
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
