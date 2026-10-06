export default function Verified({ ok, total }: { ok: number; total: number }) {
  return (
    <span className="verified" title="Every file path below was checked against the real repository tree before display.">
      <span className="verified-tick">✓</span>
      {ok} of {total} paths verified
    </span>
  );
}
