// Manually-verified English spelling corrections for guests on Shelly's side
// of the seating Excel export - and ONLY the seating Excel export. Gil was
// explicit these corrections must never touch guestRoster/Firestore data or
// any other screen, only what comes out of "export in English".
//
// Why this exists at all: Shelly's family (mostly French-Israeli) were
// entered into the roster with English names from the start - there is no
// Hebrew original to run through hebrewTransliteration.ts, so that file's
// best-effort transliterator leaves this text completely untouched (see its
// "already Latin - leave untouched" branch). Whatever casing/spelling
// happened to get typed into the roster (lowercase, stray spaces, one-off
// misspellings like "Elkaim" for "Elkayam") is what the export used to show
// verbatim.
//
// Shelly built her own seating list by hand (shared with Gil 2026-08-22,
// "shelly guest list.xlsx") with the real/professional spelling of every
// family name as her side actually uses it. This table maps the exact
// firstName+lastName currently sitting in guestRoster (both lowercased, see
// makeOverrideKey below) to the corrected pair from her list, so the export
// can show it correctly without ever writing the correction back to the
// roster itself.
//
// Coverage: only guests who appear in Shelly's list are covered - that list
// is her own seated/confirmed subset, not the full invited roster. Anyone
// not in this table falls back to generic formatting (see
// exportSeatingChart.ts's SeatingSection.tsx caller: toTitleCase after
// transliterateHebrew) rather than being left exactly as typed.
export const ENGLISH_NAME_OVERRIDES: Record<string, { firstName: string; lastName: string }> = {
  'alexandra|swerdlow': { firstName: 'Alexandra', lastName: 'Swerdlow' },
  'alexandre|elicha': { firstName: 'Alexandre', lastName: 'Elicha' },
  'amarelle|lev ari': { firstName: 'Amarelle', lastName: 'Lev Ari' },
  'amit|shabi': { firstName: 'Amit', lastName: 'Shabi' },
  'anny|perez': { firstName: 'Anny', lastName: 'Perez' },
  'anouck|hattab': { firstName: 'Anouck', lastName: 'Hattab' },
  'ariella|tayar': { firstName: 'Ariella', lastName: 'Tayar' },
  'arik|bitton': { firstName: 'Arik', lastName: 'Bitton' },
  'arnaud|maarek': { firstName: 'Arnaud', lastName: 'Marek' },
  'aron|levy': { firstName: 'Aaron', lastName: 'Levy' },
  'aurelie|messas': { firstName: 'Aurelie', lastName: 'Messas' },
  'aurel|hazout': { firstName: 'Aurel', lastName: 'Hazout' },
  'avital|edana': { firstName: 'Avital', lastName: 'Edana' },
  'avraham|berdah': { firstName: 'Avraham', lastName: 'Berdah' },
  'axelle|cohen': { firstName: 'Axelle', lastName: 'Cohen' },
  'carole|smadja': { firstName: 'Carole', lastName: 'Smadja' },
  'carole|souied': { firstName: 'Carole', lastName: 'Souied' },
  'charlotte|elicha': { firstName: 'Charlotte', lastName: 'Elicha' },
  'charly|bigiaoui': { firstName: 'Charly', lastName: 'Bigiaoui' },
  'chloe|hazout': { firstName: 'Chloe', lastName: 'Hazout' },
  'claude|bismuth': { firstName: 'Claude', lastName: 'Bismuth' },
  'claude|seror': { firstName: 'Claude', lastName: 'Seror' },
  'cohava|markus': { firstName: 'Cohava', lastName: 'Markus' },
  'coralie|shabi': { firstName: 'Coralie', lastName: 'Shabi' },
  'corinne|cohen': { firstName: 'Corrine', lastName: 'Cohen' },
  'corinne|marciano': { firstName: 'Corinne', lastName: 'Marciano' },
  'corinne|yaiche': { firstName: 'Corinne', lastName: 'Yaiche' },
  'danielle|ifrah': { firstName: 'Danielle', lastName: 'Ifrach' },
  'dan|abitbol': { firstName: 'Dan', lastName: 'Abitbol' },
  'dan|haccoun': { firstName: 'Dan', lastName: 'Haccoun' },
  'dan|tayar': { firstName: 'Dan', lastName: 'Tayar' },
  'dave|mamane': { firstName: 'Dave', lastName: 'Mamanne' },
  'david|bismuth': { firstName: 'David', lastName: 'Bismuth' },
  'david|golan': { firstName: 'David', lastName: 'Golan' },
  'einat|saadoun': { firstName: 'Einat', lastName: 'Saadoun' },
  'elisa|nataf': { firstName: 'Elisa', lastName: 'Nataf' },
  'emmanuelle|haccoun': { firstName: 'Emmanuelle', lastName: 'Haccoun' },
  'eran|zivoni': { firstName: 'Eran', lastName: 'Zivoni' },
  'eric|souied': { firstName: 'Eric', lastName: 'Souied' },
  'esther|scemama': { firstName: 'Esther', lastName: 'Scemama' },
  'ethan|tayar': { firstName: 'Ethan', lastName: 'Tayar' },
  'ety|shlomo': { firstName: 'Ety', lastName: 'Shlomo' },
  'evy|ben ishay': { firstName: 'Evy', lastName: 'Benishay' },
  'fanny|adida': { firstName: 'Fanny', lastName: 'Hadida' },
  'franck|farjon': { firstName: 'Frank', lastName: 'Farjon' },
  'gabi|amihai': { firstName: 'Gabi', lastName: 'Amihai' },
  'galia|halfon': { firstName: 'Galia', lastName: 'Halfon' },
  'galit|lass': { firstName: 'Galit', lastName: 'Lass' },
  'gerrard|pariente': { firstName: 'Gerard', lastName: 'Pariente' },
  'ghislaine|pariente': { firstName: 'Gislaine', lastName: 'Pariente' },
  'gilles|pariente': { firstName: 'Gilles', lastName: 'Pariente' },
  'henri|elkayam': { firstName: 'Henri', lastName: 'Elkayam' },
  'isabelle|bismuth': { firstName: 'Isabelle', lastName: 'Bismuth' },
  'israel|amihai': { firstName: 'Israel', lastName: 'Amihai' },
  'itzik|wolman': { firstName: 'Itzik', lastName: 'Wolman' },
  'jacky|robin': { firstName: 'Jacky', lastName: 'Robin' },
  'janet|teboul': { firstName: 'Janet', lastName: 'Teboul' },
  'jenna|levy': { firstName: 'Jenna', lastName: 'Levy' },
  'jeremy|marciano': { firstName: 'Jeremy', lastName: 'Marciano' },
  'jocelyn|bismuth': { firstName: 'Jocelyn', lastName: 'Bismuth' },
  'johanna|bitton': { firstName: 'Johanna', lastName: 'Bitton' },
  'johanna|elbaz': { firstName: 'Johanna', lastName: 'Elbaz' },
  'johanna|mamane': { firstName: 'Johanna', lastName: 'Mamanne' },
  'johan|adida': { firstName: 'Johan', lastName: 'Hadida' },
  'julia|bigiaoui': { firstName: 'Julia', lastName: 'Bigiaoui' },
  'karine|bouhanik': { firstName: 'Karine', lastName: 'Bouhanick' },
  'koby|ben ishay': { firstName: 'Koby', lastName: 'Benishay' },
  'laura|dahan': { firstName: 'Laura', lastName: 'Dahan' },
  'laurent|bitton': { firstName: 'Laurent', lastName: 'Bitton' },
  'laurent|elicha': { firstName: 'Laurent', lastName: 'Elicha' },
  'laurent|tartour': { firstName: 'Laurent', lastName: 'Tartour' },
  'lea|elghez': { firstName: 'Lea', lastName: 'Elguez' },
  'liora|zivoni': { firstName: 'Liora', lastName: 'Zivoni' },
  'livnat|elkayam': { firstName: 'Livnat', lastName: 'Elkayam' },
  'lou|teboul': { firstName: 'Lou', lastName: 'Teboul' },
  'lucien|cohen': { firstName: 'Lucien', lastName: 'Cohen' },
  'marcel|cohen': { firstName: 'Marcel', lastName: 'Cohen' },
  'marc|bouhanik': { firstName: 'Marc', lastName: 'Bouhanick' },
  'meryl|antonini': { firstName: 'Meryl', lastName: 'Antonini' },
  'michelle|zeitoun': { firstName: 'Michelle', lastName: 'Zeitoune' },
  'moshe|atlani': { firstName: 'Moshe', lastName: 'Atlani' },
  'naomie|benmussa': { firstName: 'Naomie', lastName: 'Benmussa' },
  'nathalie|robin': { firstName: 'Natalie', lastName: 'Robin' },
  'nathalie|tartour': { firstName: 'Natalie', lastName: 'Tartour' },
  'nelly|sellam': { firstName: 'Nelly', lastName: 'Sellam' },
  'noemie|elicha': { firstName: 'Noemie', lastName: 'Elicha' },
  'odette|barouch': { firstName: 'Odette', lastName: 'Barouch' },
  'ofir|karibi': { firstName: 'Ofir', lastName: 'Karibi' },
  'olivier|nataf': { firstName: 'Olivier', lastName: 'Nataf' },
  'orit|yaari': { firstName: 'Orit', lastName: 'Yaari' },
  'pascale|tayar': { firstName: 'Pascale', lastName: 'Tayar' },
  'patrick- copain de vanessa moyal|bellaiche': { firstName: 'Patrick', lastName: 'Bellaiche' },
  'patrick|bellaiche': { firstName: 'Patrick', lastName: 'Bellaiche' },
  'patrick|hamiache': { firstName: 'Patrick', lastName: 'Hamiache' },
  'pierre|barouch': { firstName: 'Pierre', lastName: 'Barouch' },
  'pnina|waitzman': { firstName: 'Pnina', lastName: 'Waitman' },
  'raphael|ben ishay': { firstName: 'Raphael', lastName: 'Benishay' },
  'rebecca|perez': { firstName: 'Rebecca', lastName: 'Perez' },
  'roger|atlani': { firstName: 'Roger', lastName: 'Atlani' },
  'romain|levy': { firstName: 'Romain', lastName: 'Levy' },
  'rony|elghez': { firstName: 'Rony', lastName: 'Elguez' },
  'ron|itah': { firstName: 'Ron', lastName: 'Itach' },
  'rudy|perez': { firstName: 'Rudy', lastName: 'Perez' },
  'sabine|bigiaoui': { firstName: 'Sabine', lastName: 'Bigiaoui' },
  'sam|benyounes': { firstName: 'Sam', lastName: 'Benyounes' },
  'sandrine|korcia': { firstName: 'Sandrine', lastName: 'Korcia' },
  'shana|moyal': { firstName: 'Shana', lastName: 'Moyal' },
  'sharone|sidoun': { firstName: 'Sharone', lastName: 'Sidoun' },
  'shay|itah': { firstName: 'Shay', lastName: 'Itach' },
  'shirit|markus': { firstName: 'Shirit', lastName: 'Markus' },
  'shuly|wolman': { firstName: 'Shuly', lastName: 'Wolman' },
  'simon|yaiche': { firstName: 'Simon', lastName: 'Yaiche' },
  'solal|benmussa': { firstName: 'Solal', lastName: 'Benmussa' },
  'soli|zivoni': { firstName: 'Soli', lastName: 'Zivoni' },
  'steeve|marciano': { firstName: 'Steve', lastName: 'Marciano' },
  'stephane|seror': { firstName: 'Stephane', lastName: 'Seror' },
  'stephane|tayar': { firstName: 'Stephane', lastName: 'Tayar' },
  'stephanie et evy|deloya': { firstName: 'Stephanie', lastName: 'Deloya' },
  'stephanie|atlani': { firstName: 'Stephanie', lastName: 'Atlani' },
  'stephanie|berdah': { firstName: 'Stephanie', lastName: 'Berdah' },
  'swan|sidoun': { firstName: 'Swan', lastName: 'Sidoun' },
  'tahel|tayar': { firstName: 'Tahel', lastName: 'Tayar' },
  'talia|tayar': { firstName: 'Talia', lastName: 'Tayar' },
  'tamar|elkayam': { firstName: 'Tamar', lastName: 'Elkayam' },
  'tara|abitbol': { firstName: 'Tara', lastName: 'Abitbol' },
  'tom|avital': { firstName: 'Tom', lastName: 'Avital' },
  'tom|farjon': { firstName: 'Tom', lastName: 'Farjon' },
  'vanessa|bismuth': { firstName: 'Vanessa', lastName: 'Bismuth' },
  'yam|ben ishay': { firstName: 'Yam', lastName: 'Benishay' },
  'yaron|tayar': { firstName: 'Yaron', lastName: 'Tayar' },
  'yohan|elbaz': { firstName: 'Yohan', lastName: 'Elbaz' },
  'yoni|cohen': { firstName: 'Yoni', lastName: 'Cohen' },
};

function makeOverrideKey(firstName: string, lastName: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
}

export function findEnglishNameOverride(firstName: string, lastName: string): { firstName: string; lastName: string } | undefined {
  return ENGLISH_NAME_OVERRIDES[makeOverrideKey(firstName, lastName)];
}

// Formatting-only cleanup (trims/collapses whitespace, title-cases each
// word) for guest names that have no exact override above - does not
// invent or change spelling, just makes stray casing/spacing from the
// original data entry ("or abergel", "  moshe  atlani") read professionally
// in the export. Word-by-word (splitting on spaces first) so multi-word
// transliterated phrases like "Family Levy" don't get collapsed into a
// single lowercase run.
export function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (part === '-' || part === "'" || part === '' ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join(''),
    )
    .join(' ');
}
