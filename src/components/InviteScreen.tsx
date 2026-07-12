import { Language, translations } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { RSVPForm } from './RSVPForm';
import inviteHe from '../assets/invite-card-he.jpg';
import inviteFr from '../assets/invite-card-fr.jpg';
import rsvpBackground from '../assets/rsvp-background.jpg';
import { buildCalendarLink } from '../utils/calendarLink';
import { EVENT_CALENDAR_START, EVENT_CALENDAR_END, EVENT_TIME_ZONE } from '../eventDetails';

interface Props {
  lang: Language;
  linkedPhone?: string;
}

export function InviteScreen({ lang, linkedPhone }: Props) {
  const t = translations[lang];
  const cardImage = lang === 'fr' ? inviteFr : inviteHe;

  // A text-search Waze link (built from the venue name) was resolving to
  // the wrong nearby place ("מטבח חוות רונית" instead of the venue itself).
  // This is the exact Waze deep link the original site used - it points at
  // fixed coordinates instead of a fuzzy name search, so it can't drift to
  // the wrong result.
  const wazeUrl = 'https://waze.com/ul/hsv8z2g4m';

  // Plain venue name only - the plus code is precise for navigation, but
  // shown in the calendar event's own location field it read as odd/
  // confusing text to guests. Waze already gets the exact location via its
  // own dedicated deep link above, so nothing is lost by keeping this field
  // simple and human-readable.
  const calendarLink = buildCalendarLink({
    title: `${t.names} - ${t.subtitle}`,
    location: t.venue,
    description: t.venueName,
    startCompact: EVENT_CALENDAR_START,
    endCompact: EVENT_CALENDAR_END,
    timeZone: EVENT_TIME_ZONE,
  });

  return (
    <div>
      <LanguageSwitcher currentLang={lang} linkedPhone={linkedPhone} variant="invite" />

      <div className="invite-card-wrap">
        <img className="card-img" src={cardImage} alt={`${t.names} — ${t.venueName}, ${t.venue}`} />
        <div className="scroll-cue-overlay">
          <div className="scroll-cue-pill">
            <p className="scroll-cue">{t.scrollCue}</p>
            <svg
              className="scroll-chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4a453c"
              strokeWidth={2}
              style={{ display: 'block' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      <div className="rsvp-wrap" style={{ backgroundImage: `url(${rsvpBackground})` }}>
        <RSVPForm lang={lang} linkedPhone={linkedPhone} wazeUrl={wazeUrl} calendarLink={calendarLink} />
      </div>
    </div>
  );
}
