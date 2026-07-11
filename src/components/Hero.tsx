import { Language, translations } from '../i18n';
import { motion } from 'motion/react';
import { Countdown } from './Countdown';
import ringsImage from '../assets/rings-transparent.png';

interface Props {
  lang: Language;
}

export function Hero({ lang }: Props) {
  const t = translations[lang];
  // Sensitive event timing belongs in .env.local when preparing a real invitation.
  const weddingDate = import.meta.env.VITE_EVENT_START_ISO || '2027-01-01T17:00:00';

  return (
    <div className="text-center space-y-6 mb-2 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-5xl md:text-7xl font-serif text-gray-900 tracking-tight mb-4 drop-shadow-sm">
          {t.names}
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 font-light italic tracking-wide">
          {t.subtitle}
        </p>
        <div className="flex justify-center mt-4 mb-0">
          <img
            src={ringsImage}
            alt=""
            className="h-24 w-40 object-cover"
            aria-hidden="true"
          />
        </div>
      </motion.div>

      <Countdown lang={lang} targetDate={weddingDate} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="flex flex-col items-center justify-center gap-2 text-gray-700 mt-8"
      >
        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-gray-300"></div>
          <p className="text-lg font-medium tracking-widest uppercase text-gray-500">
            {t.date}
          </p>
          <div className="h-px w-12 bg-gray-300"></div>
        </div>
        <p className="text-xl font-medium tracking-wider text-gray-800">
          {t.venueName}
        </p>
        <p className="text-md text-gray-500 tracking-wider">
          {t.venue}
        </p>
      </motion.div>
    </div>
  );
}
