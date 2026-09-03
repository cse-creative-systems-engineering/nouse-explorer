import { safeStorage } from 'electron';
import { getDb } from './db.js';

/**
 * Secret-backed settings. Secrets (API keys) are encrypted with Electron's
 * safeStorage (OS keychain via libsecret on Linux) when available; otherwise
 * they degrade to the settings table (plaintext, flagged). Non-secret
 * settings (distiller model, batch size) live in the settings table.
 */

export interface AppSettings {
  nousApiKeySet: boolean;
  nousApiKeyMasked: string | null;
  aaApiKeySet: boolean;
  aaApiKeyMasked: string | null;
  distillerModel: string;
  encryptionAvailable: boolean;
}

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    )
    .run(key, value);
}

const SECRET_PREFIX = 'enc:';

export function setSecret(name: string, value: string): void {
  let stored = 'plain:' + value;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      stored = SECRET_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
  } catch (e) {
    // safeStorage backend can fail at call time even when isEncryptionAvailable
    // reported true (e.g. keyring locked) — never let the save die.
    console.error('[settings] safeStorage failed, falling back to plaintext', e);
    stored = 'plain:' + value;
  }
  setSetting(`secret:${name}`, stored);
}

export function getSecret(name: string): string | null {
  const raw = getSetting(`secret:${name}`);
  if (!raw) return null;
  if (raw.startsWith(SECRET_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.slice(SECRET_PREFIX.length), 'base64'));
    } catch (e) {
      console.error('[settings] decrypt failed for', name, e);
      return null;
    }
  }
  if (raw.startsWith('plain:')) return raw.slice('plain:'.length);
  return null;
}

export function hasSecret(name: string): boolean {
  return getSetting(`secret:${name}`) !== null;
}

export function maskedSecret(name: string): string | null {
  const v = getSecret(name);
  if (!v) return null;
  if (v.length <= 4) return '••••';
  return '••••' + v.slice(-4);
}

export function getDistillerModel(): string {
  return getSetting('distiller_model') ?? 'inclusionai/ling-3.0-flash-fin:free';
}

export function setDistillerModel(model: string): void {
  setSetting('distiller_model', model);
}

export function getSettingsView(): AppSettings {
  return {
    nousApiKeySet: hasSecret('nous_api_key'),
    nousApiKeyMasked: maskedSecret('nous_api_key'),
    aaApiKeySet: hasSecret('aa_api_key'),
    aaApiKeyMasked: maskedSecret('aa_api_key'),
    distillerModel: getDistillerModel(),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  };
}
