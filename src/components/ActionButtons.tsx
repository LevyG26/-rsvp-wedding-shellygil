import { Language, translations } from '../i18n';
import { motion } from 'motion/react';
import { CalendarPlus, MapPin } from 'lucide-react';

interface Props {
  lang: Language;
}

export function ActionButtons({ lang }: Props) {
  const t = translations[lang];

  const encodedAddress = encodeURIComponent(t.venue);
  const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  // Sensitive event timing belongs in .env.local when preparing a real invitation.
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.8 }}
      className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6 mb-8 relative z-10 w-full px-4"
    >
      <a
        href={wazeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/80 backdrop-blur-sm text-gray-900 rounded-2xl font-medium shadow-md hover:bg-white hover:shadow-lg transition-all border border-gray-200"
      >
        <MapPin size={22} className="text-gray-700" />
        <span>{t.navigation}</span>
      </a>

      <a
        href={googleCalendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/80 backdrop-blur-sm text-gray-900 rounded-2xl font-medium shadow-md hover:bg-white hover:shadow-lg transition-all border border-gray-200"
      >
        <CalendarPlus size={22} className="text-gray-700" />
        <span>{t.addToCalendar}</span>
      </a>
    </motion.div>
  );
}
