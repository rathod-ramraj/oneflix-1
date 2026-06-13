import { LANGUAGES } from '../utils/languages';

export default function LanguagesBrowse({ active, onChange }) {
  return (
    <section className="languages-browse">
      <h2 className="languages-browse-title">Browse by Languages</h2>
      <div className="languages-browse-track">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            type="button"
            className={`languages-pill${active === lang.id ? ' active' : ''}`}
            onClick={() => onChange(lang.id)}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </section>
  );
}
