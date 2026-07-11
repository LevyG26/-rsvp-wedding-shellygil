import { Language, translations } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { RSVPForm } from './RSVPForm';
import inviteHe from '../assets/invite-card-he.jpg';
import inviteFr from '../assets/invite-card-fr.jpg';
import rsvpBackground from '../assets/rsvp-background.jpg';

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
  const calendarParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${t.names} - ${t.subtitle}`,
    dates: `${eventStart}/${eventEnd}`,
    location: t.venue,
    details: t.venueName,
    ctz: eventTimeZone,
  });
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${calendarParams.toString()}`;

  return (
    <div>
      <LanguageSwitcher currentLang={lang} linkedPhone={linkedPhone} variant="invite" />

      <img className="card-img" src={cardImage} alt={`${t.names} — ${t.venueName}, ${t.venue}`} />

      <div className="transition-strip">
        <p className="scroll-cue">{t.scrollCue}</p>
        <svg
          className="scroll-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a877e"
          strokeWidth={2}
          style={{ display: 'block', margin: '0 auto 12px' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <div className="rsvp-wrap" style={{ backgroundImage: `url(${rsvpBackground})` }}>
        <RSVPForm lang={lang} linkedPhone={linkedPhone} wazeUrl={wazeUrl} googleCalendarUrl={googleCalendarUrl} />
      </div>
    </div>
  );
}
