import type { LlmSettings, Provider } from "../lib/settings";
import { PROVIDERS } from "../lib/settings";

export default function Settings({
  value,
  serverKey,
  serverModel,
  onChange,
  onClose,
}: {
  value: LlmSettings;
  serverKey: boolean;
  serverModel: string;
  onChange: (s: LlmSettings) => void;
  onClose: () => void;
}) {
  const p = PROVIDERS[value.provider];
  const defaultModel = value.provider === "openrouter" ? serverModel || p.models[0] : p.models[0];
  const hasKey = value.key.trim() !== "" || (value.provider === "openrouter" && serverKey);

  return (
    <section className="settings" aria-label="Model settings">
      <div className="settings-row">
        <label className="settings-field">
          <span className="settings-label">Provider</span>
          <select
            className="url-input"
            value={value.provider}
            onChange={(e) => onChange({ ...value, provider: e.target.value as Provider, model: "" })}
          >
            {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
              <option key={k} value={k}>
                {PROVIDERS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-field">
          <span className="settings-label">Model</span>
          <input
            className="url-input"
            list="model-list"
            value={value.model}
            placeholder={defaultModel}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            spellCheck={false}
          />
          <datalist id="model-list">
            {p.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="settings-field">
        <span className="settings-label">{p.label} API key</span>
        <input
          className="url-input"
          type="password"
          autoComplete="off"
          value={value.key}
          placeholder={value.provider === "openrouter" && serverKey ? "Using the server's key (paste to override)" : p.keyHint}
          onChange={(e) => onChange({ ...value, key: e.target.value })}
          spellCheck={false}
        />
      </label>
      <p className="cta-note">
        Get a key at {p.keyUrl.replace("https://", "")}. It is stored in this browser only and sent to this app's
        server per request, never saved there.
      </p>
      <div className="placement-actions">
        <button type="button" className="btn btn-solid" onClick={onClose}>
          {hasKey ? "Done" : "Close"}
        </button>
        <span className="cta-note">{hasKey ? `Ready: ${p.label} · ${value.model || defaultModel}` : "No key yet. Analysis needs one."}</span>
      </div>
    </section>
  );
}
