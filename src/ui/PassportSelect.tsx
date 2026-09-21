import { countryName, flagEmoji } from '../lib/countries';
import { PASSPORTS } from '../lib/passports';
import { useApp } from '../store';

export function PassportSelect() {
  const passport = useApp((s) => s.passport);
  const manifest = useApp((s) => s.manifest);
  const setPassport = useApp((s) => s.setPassport);
  const list = manifest?.passports ?? PASSPORTS;
  return (
    <label className="passport-select">
      <span className="visually-hidden">Паспорт</span>
      <select value={passport} onChange={(e) => setPassport(e.target.value)} aria-label="Паспорт">
        {list.map((p) => (
          <option key={p.code} value={p.code}>
            {flagEmoji(p.iso3)} {p.name || countryName(p.iso3)}
          </option>
        ))}
      </select>
    </label>
  );
}
