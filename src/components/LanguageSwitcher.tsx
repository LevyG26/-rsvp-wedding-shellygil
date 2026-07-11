import { Link } from 'react-router-dom';
import { Language } from '../i18n';

interface Props {
  currentLang: Language;
  linkedPhone?: string;
  variant: 'cover' | 'invite';
  onSelect?: () => void;
}

// Guests only ever choose between Hebrew and French, matching the real
// invitation. English remains available for the admin dashboard only.
const languages: { code: Language; label: string }[] = [
  { code: 'he', label: 'עברית' },
  { code: 'fr', label: 'Français' },
];

export function LanguageSwitcher({ currentLang, linkedPhone, variant, onSelect }: Props) {
  const path = (code: Language) => (linkedPhone ? `/${code}/${linkedPhone}` : `/${code}`);

  if (variant === 'cover') {
    return (
      <div className="cover-lang">
        {languages.map((lang) => (
          <Link key={lang.code} to={path(lang.code)} onClick={onSelect} dir="ltr">
            {lang.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="invite-lang">
      {languages.map((lang, index) => (
        <span key={lang.code} style={{ display: 'contents' }}>
          {index > 0 && <span className="sep">·</span>}
          <Link to={path(lang.code)} dir="ltr" className={currentLang === lang.code ? 'active' : ''}>
            {lang.label}
          </Link>
        </span>
      ))}
    </div>
  );
}
