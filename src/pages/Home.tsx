import { useEffect, useRef, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { CoverScreen } from '../components/CoverScreen';
import { InviteScreen } from '../components/InviteScreen';
import { Language } from '../i18n';
import { recordInviteLinkVisit } from '../services/inviteLinkVisits';
import { normalizePhoneNumber } from '../utils/phoneNumbers';
import backgroundMusic from '../assets/background-music-opt.mp3';

// The song should pick up mid-track, not from the very start.
const MUSIC_START_SECONDS = 61;

export function Home() {
  const { lang, phoneNumber } = useParams<{ lang?: string; phoneNumber?: string }>();
  // Guests only ever see Hebrew or French, matching the real invitation.
  const isValidLanguage = !lang || ['he', 'fr'].includes(lang);
  const currentLang = (isValidLanguage ? (lang ?? 'he') : 'he') as Language;
  const isRtl = currentLang !== 'fr';
  const linkedPhone = normalizePhoneNumber(phoneNumber);
  const shouldRedirectInvalidPhone = Boolean(phoneNumber && !linkedPhone);

  const [screen, setScreen] = useState<'cover' | 'invite'>('cover');
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicStartedRef = useRef(false);

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [currentLang, isRtl]);

  useEffect(() => {
    if (!linkedPhone) {
      return;
    }

    recordInviteLinkVisit(linkedPhone, currentLang).catch((visitError) => {
      console.error('Failed to record invite link visit', visitError);
    });
  }, [currentLang, linkedPhone]);

  const startMusic = () => {
    const audio = audioRef.current;
    if (!audio || musicStartedRef.current) return;
    musicStartedRef.current = true;
    audio.currentTime = MUSIC_START_SECONDS;
    audio.play().then(() => setIsMusicPlaying(true)).catch(() => {
      // Autoplay can still be blocked in some browsers; the floating
      // toggle lets the guest start it manually.
    });
  };

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (!musicStartedRef.current) {
        musicStartedRef.current = true;
        audio.currentTime = MUSIC_START_SECONDS;
      }
      audio.play().then(() => setIsMusicPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  const handleEnter = () => {
    setScreen('invite');
    startMusic();
  };

  // Redirect to Hebrew if no valid language is provided
  if (!isValidLanguage) {
    return <Navigate to="/he" replace />;
  }

  if (shouldRedirectInvalidPhone) {
    return <Navigate to={`/${currentLang}`} replace />;
  }

  return (
    <div className="site-backdrop">
      <div className="phone">
        <audio ref={audioRef} src={backgroundMusic} loop preload="none" />

        <button
          type="button"
          className={`music-btn${isMusicPlaying ? ' playing' : ''}`}
          onClick={toggleMusic}
          aria-label={currentLang === 'fr' ? 'Musique' : 'מוזיקה'}
        >
          <svg className="icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          <svg className="icon-playing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </button>

        {screen === 'cover' ? (
          <CoverScreen currentLang={currentLang} linkedPhone={linkedPhone} onSelectLanguage={handleEnter} />
        ) : (
          <InviteScreen lang={currentLang} linkedPhone={linkedPhone} />
        )}
      </div>
    </div>
  );
}
