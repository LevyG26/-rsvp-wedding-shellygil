import React, { useEffect, useState } from 'react';
import { CheckCircle2, Pencil, XCircle } from 'lucide-react';
import { Language, translations } from '../i18n';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import logoSg from '../assets/logo-sg-dark.png';
import { isValidPhoneNumber } from '../utils/phoneNumbers';
import { CalendarLink } from '../utils/calendarLink';
import { EVENT_START_ISO } from '../eventDetails';
import { loadRsvpSubmission, saveRsvpSubmission } from '../utils/rsvpSubmission';

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

// The "navigate"/"add to calendar" buttons used to only show on the form
// itself, before submitting - once a guest confirmed and saw the thank-you
// screen, they were gone. Pulled into its own small component (rather than
// duplicating the JSX) so the exact same buttons can also be shown on the
// post-submission screen, in addition to the original spot on the form.
function EventActionButtons({
  wazeUrl,
  calendarLink,
  navigationLabel,
  addToCalendarLabel,
}: {
  wazeUrl?: string;
  calendarLink?: CalendarLink;
  navigationLabel: string;
  addToCalendarLabel: string;
}) {
  if (!wazeUrl && !calendarLink) return null;

  return (
    <div className="waze-row">
      {wazeUrl && (
        <a className="waze-btn" href={wazeUrl} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="#5c594f" strokeWidth={2}>
            <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span>{navigationLabel}</span>
        </a>
      )}
      {calendarLink && (
        // calendarLink.href is a real Blob object URL for the Apple/.ics
        // case (not a data: URI) - `download` is reliable on Blob URLs in
        // mobile Safari, unlike on data: URIs, which is what made this
        // button silently do nothing before.
        <a
          className="waze-btn"
          href={calendarLink.href}
          {...(calendarLink.isDownload
            ? { download: calendarLink.fileName }
            : { target: '_blank', rel: 'noopener noreferrer' })}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#5c594f" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span>{addToCalendarLabel}</span>
        </a>
      )}
    </div>
  );
}

export function RSVPForm({ lang, linkedPhone, wazeUrl, calendarLink }: Props) {
  const t = translations[lang];
  const weddingDate = EVENT_START_ISO;
  const dateLine = formatDateLine(lang, weddingDate);

  const [fullName, setFullName] = useState('');
  const [hasFullNameError, setHasFullNameError] = useState(false);
  // Live suggestions from the real guest roster (see api/guest-search.ts) as
  // the name field is typed - purely assistive, never required: a guest can
  // still submit any typed name exactly as before, this just makes it easier
  // to spell it the same way it's recorded on the roster.
  const [nameSuggestions, setNameSuggestions] = useState<{ id: string; fullName: string }[]>([]);
  const [isNameFieldFocused, setIsNameFieldFocused] = useState(false);
  const [phone, setPhone] = useState('');
  const [hasPhoneError, setHasPhoneError] = useState(false);
  const [isAttending, setIsAttending] = useState<boolean | null>(null);
  const [guestsCount, setGuestsCount] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  // Set once we know this browser already has a saved answer for this link
  // (see src/utils/rsvpSubmission.ts) - a truthy value here means "update
  // the existing rsvps doc" instead of "create a new one".
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);

  // Runs once on mount: if this guest already submitted from this browser
  // (their answer is remembered under this link's phone, or under the
  // shared "general" slot for the phone-less link), pre-fill the form with
  // their previous answer and show the thank-you screen right away, as if
  // they'd just submitted it - so reopening the same link doesn't look like
  // a blank new form.
  useEffect(() => {
    const saved = loadRsvpSubmission(linkedPhone || '');
    if (!saved) return;
    setExistingSubmissionId(saved.id);
    setFullName(saved.fullName);
    setIsAttending(saved.isAttending);
    setGuestsCount(saved.guestsCount);
    if (saved.phone) setPhone(saved.phone);
    setSubmitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPhone]);

  // Debounced (400ms after typing stops) + a 2-character floor, matched by
  // api/guest-search.ts's own floor - both exist so a guest pausing mid-word
  // doesn't fire a request per keystroke. This project already had a real
  // Firestore quota outage once; the search endpoint itself caches the
  // roster for a minute so repeated calls across every guest stay cheap, and
  // this debounce keeps the CALL volume itself low to begin with. Skipped
  // entirely once submitted (the thank-you screen is showing, no name field
  // visible to suggest anything for).
  useEffect(() => {
    if (submitted) {
      setNameSuggestions([]);
      return;
    }

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setNameSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch(`/api/guest-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data) => {
          setNameSuggestions(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          // Silent - a failed lookup must never block or alarm someone just
          // trying to submit their RSVP. Free typing still works exactly as
          // before with no suggestions shown.
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fullName, submitted]);

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
      const trimmedFullName = fullName.trim();
      let savedId = existingSubmissionId;
      const wasUpdate = Boolean(existingSubmissionId);

      if (existingSubmissionId) {
        // Editing a previous answer from this same browser - only ever
        // touches the fields the guest controls (createdAt is deliberately
        // left out entirely, since the rules require it to stay unchanged;
        // omitting it here rather than resending the old value keeps this
        // in sync automatically if that ever changes). attendanceSetByAdmin
        // is explicitly cleared here - this is the guest's own real answer,
        // so any earlier admin correction no longer applies (see
        // firestore.rules' isValidGuestRsvpSelfUpdate for why this is the
        // one field a self-update may only ever set back to false).
        const updateData: any = { fullName: trimmedFullName, isAttending, guestsCount, lang, attendanceSetByAdmin: false };
        if (phoneToSave) updateData.phone = phoneToSave;
        await updateDoc(doc(db, 'rsvps', existingSubmissionId), updateData);
      } else {
        const dataToSave: any = {
          fullName: trimmedFullName,
          isAttending,
          guestsCount,
          lang,
          createdAt: serverTimestamp(),
        };

        if (phoneToSave) {
          dataToSave.phone = phoneToSave;
        }

        const created = await addDoc(collection(db, 'rsvps'), dataToSave);
        savedId = created.id;
        setExistingSubmissionId(created.id);
      }

      if (savedId) {
        saveRsvpSubmission(linkedPhone || '', {
          id: savedId,
          fullName: trimmedFullName,
          isAttending: isAttending as boolean,
          guestsCount,
          phone: phoneToSave || undefined,
        });

        // Best-effort mobile notification for the couple - never blocks or
        // fails the guest's own submission if this call has trouble (offline,
        // notifications not set up yet, etc.), since that's a nice-to-have
        // for the admins, not something the guest should ever see fail.
        fetch('/api/notify-rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rsvpId: savedId, isUpdate: wasUpdate }),
        }).catch(() => {});
      }

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

        {/* Shows back exactly what was recorded - both right after a fresh
            submission and when reopening a previously-answered link - so the
            guest can actually see (and, via the update button below, fix)
            their name/phone/guest count instead of just a generic "thank
            you" with no way to tell what's on file. */}
        <div className="thankyou-summary">
          <p><span className="thankyou-summary-label">{t.fullName}:</span> {fullName}</p>
          <p><span className="thankyou-summary-label">{t.guestsCount}:</span> {guestsCount}</p>
          {/* linkedPhone (from a personal /link/{phone} URL) is the saved
              phone just as much as one typed into the optional field - the
              phone input itself is hidden whenever linkedPhone is set, so
              the typed-phone state alone would miss it. */}
          {(linkedPhone || phone) && (
            <p><span className="thankyou-summary-label">{t.phoneSummaryLabel}:</span> <span dir="ltr">{linkedPhone || phone}</span></p>
          )}
        </div>

        {isAttending && (
          <img src={logoSg} alt="" aria-hidden="true" className="thankyou-logo" />
        )}

        {/* Only shown when attending - navigating/saving the date to a
            calendar isn't relevant to a guest who just declined. */}
        {isAttending && (
          <EventActionButtons
            wazeUrl={wazeUrl}
            calendarLink={calendarLink}
            navigationLabel={t.navigation}
            addToCalendarLabel={t.addToCalendar}
          />
        )}

        {/* Only offered when there's an actual saved answer to change
            (existingSubmissionId) - reopens the form below, pre-filled with
            that answer; submitting again updates the same rsvps document
            instead of creating a duplicate one. */}
        {existingSubmissionId && (
          <button
            type="button"
            className="update-response-btn"
            onClick={() => setSubmitted(false)}
          >
            <Pencil size={13} />
            {t.updateResponse}
          </button>
        )}
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
        <div className="field name-field">
          <label htmlFor="rsvp-full-name">{t.fullName}</label>
          <input
            id="rsvp-full-name"
            type="text"
            autoComplete="off"
            value={fullName}
            onChange={handleFullNameChange}
            onFocus={() => setIsNameFieldFocused(true)}
            onBlur={() => setIsNameFieldFocused(false)}
            aria-invalid={hasFullNameError}
            aria-describedby={hasFullNameError ? 'full-name-error' : undefined}
            aria-autocomplete="list"
            aria-expanded={isNameFieldFocused && nameSuggestions.length > 0}
            className={hasFullNameError ? 'has-error' : ''}
          />
          {hasFullNameError && (
            <p id="full-name-error" className="error-text" role="alert">
              {t.fullNameLettersOnly}
            </p>
          )}
          {/* Purely assistive - picking one just fills in the exact roster
              spelling, it never restricts what can be typed/submitted. Each
              button's onMouseDown prevents the default focus change, so the
              click registers before the input's onBlur closes this list. */}
          {isNameFieldFocused && nameSuggestions.length > 0 && (
            <div className="name-suggestions" role="listbox">
              {nameSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="name-suggestion-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setFullName(suggestion.fullName);
                    setHasFullNameError(false);
                    setNameSuggestions([]);
                    setIsNameFieldFocused(false);
                  }}
                >
                  {suggestion.fullName}
                </button>
              ))}
            </div>
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

      <EventActionButtons
        wazeUrl={wazeUrl}
        calendarLink={calendarLink}
        navigationLabel={t.navigation}
        addToCalendarLabel={t.addToCalendar}
      />
    </div>
  );
}
