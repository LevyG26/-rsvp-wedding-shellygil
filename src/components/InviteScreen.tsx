import { Language, translations } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { RSVPForm } from './RSVPForm';
import inviteHe from '../assets/invite-card-he.jpg';
import inviteFr from '../assets/invite-card-fr.jpg';
import rsvpBackground from '../assets/rsvp-background.jpg';
import { buildCalendarLink } from '../utils/calendarLink';

interface Props {
  lang: Language;
  linkedPhone?: string;
}

export function InviteScreen({ lang, linkedPhone }: Props) {
  const t = translations[lang];
  const cardImage = lang === 'fr' ? inviteFr : inviteHe;

  const encodedAddress = encodeURIComponent(t.venue);
  const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  const eventStart = import.meta.env.VITE_EVENT_CALENDAR_START || '20270101T170000';
  const eventEnd = import.meta.env.VITE_EVENT_CALENDAR_END || '20270101T220000';
  const eventTimeZone = import.meta.env.VITE_EVENT_TIME_ZONE || 'Asia/Jerusalem';
  const calendarLink = buildCalendarLink({
    title: `${t.names} - ${t.subtitle}`,
    location: t.venue,
    description: t.venueName,
    startCompact: eventStart,
    endCompact: eventEnd,
    timeZone: eventTimeZone,
  });

  return (
    <div>
      <LanguageSwitcher currentLang={lang} linkedPhone={linkedPhone} variant="invite" />

      <div className="invite-card-wrap">
        <img className="card-img" src={cardImage} alt={`${t.names} — ${t.venueName}, ${t.venue}`} />
        <div className="scroll-cue-overlay">
          <p className="scroll-cue">{t.scrollCue}</p>
          <svg
            className="scroll-chevron"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b6862"
            strokeWidth={2}
            style={{ display: 'block', margin: '0 auto' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="rsvp-wrap" style={{ backgroundImage: `url(${rsvpBackground})` }}>
        <RSVPForm lang={lang} linkedPhone={linkedPhone} wazeUrl={wazeUrl} calendarLink={calendarLink} />
      </div>
    </div>
  );
}
