import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Language, translations } from '../i18n';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import thankYouImage from '../assets/rings-transparent.png';
import { isValidPhoneNumber } from '../utils/phoneNumbers';
import { CalendarLink } from '../utils/calendarLink';
import { EVENT_START_ISO } from '../eventDetails';

interface Props {
  lang: Language;
  linkedPhone?: string;
  wazeUrl?: string;
  calendarLink?: CalendarLink;
}

const FULL_NAME_PATTERN = /^[\p{L}\p{M}\s]*$/u;
const MAX_GUESTS = 20;

interface DateLineParts {
  datePart: string;
  timePart: string;
}

function formatDateLine(lang: Language, iso: string): DateLineParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const locale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'he-IL';
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return { datePart, timePart };
}

export function RSVPForm({ lang, linkedPhone, wazeUrl, calendarLink }: Props) {
  const t = translations[lang];
  const weddingDate = EVENT_START_ISO;
  const dateLine = formatDateLine(lang, weddingDate);

  const [fullName, setFullName] = useState('');
  const [hasFullNameError, setHasFullNameError] = useState(false);
  const [phone, setPhone] = useState('');
  const [hasPhoneError, setHasPhoneError] = useState(false);
  const [isAttending, setIsAttending] = useState<boolean | null>(null);
  const [guestsCount, setGuestsCount] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleFullNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFullName = event.target.value;

    if (!FULL_NAME_PATTERN.test(nextFullName)) {
      setHasFullNameError(true);
      return;
    }

    setFullName(nextFullName);
    setHasFullNameError(false);
  };

  const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextPhone = event.target.value;

    if (!/^\d*$/.test(nextPhone)) {
      setHasPhoneError(true);
      return;
    }

    setPhone(nextPhone);
    setHasPhoneError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || isAttending === null) {
      setError(t.fillAllFields);
      return;
    }

    const phoneToSave = linkedPhone || phone.trim();
    if (!linkedPhone && phoneToSave && !isValidPhoneNumber(phoneToSave)) {
      setHasPhoneError(true);
      setError(t.phoneInvalid);
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const dataToSave: any = {
        fullName: fullName.trim(),
        isAttending,
        guestsCount,
        lang,
        createdAt: serverTimestamp(),
      };

      if (phoneToSave) {
        dataToSave.phone = phoneToSave;
      }

      await addDoc(collection(db, 'rsvps'), dataToSave);
      setSubmitted(true);
    } catch (err: any) {
      console.error('Error saving RSVP:', err);
      const isQuotaError = err?.message?.toLowerCase().includes('quota');
      setError(isQuotaError ? 'Service is busy. Please try again later.' : 'Failed to submit RSVP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="form-card thankyou-card">
        <div className="flex justify-center mb-2">
          {isAttending ? (
            <CheckCircle2 className="w-12 h-12" color="#3f7a5c" strokeWidth={1.5} />
          ) : (
            <XCircle className="w-12 h-12" color="#b3453f" strokeWidth={1.5} />
          )}
        </div>
        <p className="rsvp-title" style={{ fontSize: 19 }}>{t.thankYou}</p>
        <p className="helper-text" style={{ fontSize: 13 }}>
          {isAttending ? t.thankYouAttending : t.thankYouNotAttending}
        </p>

        {isAttending && <img src={thankYouImage} alt="" aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div className="form-card">
      <p className="rsvp-title">{t.rsvpTitle}</p>

      <form onSubmit={handleSubmit}>
        {dateLine && (
          <div className="date-line">
            <p className="date-line-date">{dateLine.datePart}</p>
            <p className="date-line-time">{dateLine.timePart}</p>
          </div>
        )}

        {/* Name */}
        <div className="field">
          <label htmlFor="rsvp-full-name">{t.fullName}</label>
          <input
            id="rsvp-full-name"
            type="text"
            value={fullName}
            onChange={handleFullNameChange}
            aria-invalid={hasFullNameError}
            aria-describedby={hasFullNameError ? 'full-name-error' : undefined}
            className={hasFullNameError ? 'has-error' : ''}
          />
          {hasFullNameError && (
            <p id="full-name-error" className="error-text" role="alert">
              {t.fullNameLettersOnly}
            </p>
          )}
        </div>

        {!linkedPhone && (
          <div className="field">
            <label htmlFor="rsvp-phone">{t.phoneOptional}</label>
            <input
              id="rsvp-phone"
              type="tel"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              inputMode="numeric"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              onChange={handlePhoneChange}
              aria-invalid={hasPhoneError}
              aria-describedby={hasPhoneError ? 'phone-error' : undefined}
              className={hasPhoneError ? 'has-error' : ''}
            />
            {hasPhoneError && (
              <p id="phone-error" className="error-text" role="alert">
                {t.phoneInvalid}
              </p>
            )}
          </div>
        )}

        {/* Attendance */}
        <div className="field">
          <label>{t.selectAttendance}</label>
          <div className="radio-row">
            <label className={`radio-option${isAttending === true ? ' selected' : ''}`}>
              <input
                type="radio"
                name="attend"
                checked={isAttending === true}
                onChange={() => setIsAttending(true)}
              />
              <span>{t.attending}</span>
            </label>
            <label className={`radio-option${isAttending === false ? ' selected' : ''}`}>
              <input
                type="radio"
                name="attend"
                checked={isAttending === false}
                onChange={() => setIsAttending(false)}
              />
              <span>{t.notAttending}</span>
            </label>
          </div>
        </div>

        {/* Guests count */}
        <div className="field">
          <label>{t.guestsCount}</label>
          <div className="stepper">
            <button
              type="button"
              onClick={() => setGuestsCount((count) => Math.max(1, count - 1))}
              disabled={guestsCount <= 1}
              aria-label="-"
            >
              −
            </button>
            <span>{guestsCount}</span>
            <button
              type="button"
              onClick={() => setGuestsCount((count) => Math.min(MAX_GUESTS, count + 1))}
              disabled={guestsCount >= MAX_GUESTS}
              aria-label="+"
            >
              +
            </button>
          </div>
        </div>

        {error && <p className="error-text" style={{ fontSize: 13, fontWeight: 'bold' }}>{error}</p>}

        <button type="submit" className="submit-btn" disabled={isSubmitting}>
          {isSubmitting ? '…' : t.submit}
        </button>
      </form>

      {(wazeUrl || calendarLink) && (
        <div className="waze-row">
          {wazeUrl && (
            <a className="waze-btn" href={wazeUrl} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="#5c594f" strokeWidth={2}>
                <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span>{t.navigation}</span>
            </a>
          )}
          {calendarLink && (
            <a
              className="waze-btn"
              href={calendarLink.href}
              download={calendarLink.isDownload ? calendarLink.fileName : undefined}
              target={calendarLink.isDownload ? undefined : '_blank'}
              rel={calendarLink.isDownload ? undefined : 'noopener noreferrer'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#5c594f" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span>{t.addToCalendar}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
