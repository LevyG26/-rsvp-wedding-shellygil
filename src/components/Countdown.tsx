import { useState, useEffect } from 'react';
import { Language, translations } from '../i18n';
import { motion } from 'motion/react';

interface Props {
  lang: Language;
  targetDate: string;
}

export function Countdown({ lang, targetDate }: Props) {
  const t = translations[lang];

  const calculateTimeLeft = () => {
    const difference = +new Date(targetDate) - +new Date();
    let timeLeft = {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };

    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    }
    return timeLeft;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const timeUnits = [
    { label: t.days, value: timeLeft.days },
    { label: t.hours, value: timeLeft.hours },
    { label: t.minutes, value: timeLeft.minutes },
    { label: t.seconds, value: timeLeft.seconds }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.8 }}
      className="flex justify-center gap-3 sm:gap-6 mt-12"
    >
      {timeUnits.map((unit, index) => (
        <div key={index} className="flex flex-col items-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-sm border border-white/50 mb-3">
            <span className="text-2xl sm:text-4xl font-serif text-gray-900" dir="ltr">
              {unit.value.toString().padStart(2, '0')}
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-medium text-gray-600 uppercase tracking-widest">{unit.label}</span>
        </div>
      ))}
    </motion.div>
  );
}
