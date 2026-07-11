import { Language, translations } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import heroCover from '../assets/hero-cover.jpg';

interface Props {
  currentLang: Language;
  linkedPhone?: string;
  onSelectLanguage: () => void;
}

export function CoverScreen({ currentLang, linkedPhone, onSelectLanguage }: Props) {
  const t = translations[currentLang];

  return (
    <div className="cover-wrap">
      <img className="card-img" src={heroCover} alt={`${t.names} — ${t.subtitle}`} />
      <LanguageSwitcher
        currentLang={currentLang}
        linkedPhone={linkedPhone}
        variant="cover"
        onSelect={onSelectLanguage}
      />
    </div>
  );
}
