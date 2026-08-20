// Best-effort Hebrew -> Latin transliteration, used only by the seating
// Excel export's "export in English" option (see SeatingSection.tsx /
// exportSeatingChart.ts). Guest names, categories, and sides are free text
// Gil typed in Hebrew - there's no separate English field anywhere in the
// data model - and Hebrew is normally written without nikud (vowel points),
// so there is no way to algorithmically recover which vowels belong between
// consonants from the text alone (e.g. unpointed "דוד" could be "David",
// "Dvir", or "Dod" - all valid readings of the same three letters). This
// can only ever be an approximation, not a real translation.
//
// Two layers, in order:
// 1. KNOWN_WORDS - an exact-match dictionary of words we can get right with
//    confidence: the couple's own two side names (which must match how
//    they're already spelled in the English UI - see i18n.ts's `names`
//    key), "שולחן" (every table name is "שולחן NN"), and a curated list of
//    very common Israeli first names and guest-category/relationship words.
// 2. A plain per-letter consonant map as a fallback for anything not in the
//    dictionary - this will often read oddly (no inferred vowels beyond
//    what י/ו contribute) but at least produces *something* readable in
//    Latin script rather than leaving the cell blank or crashing the export.
const KNOWN_WORDS: Record<string, string> = {
  // The couple's own sides - must match the English spelling already used
  // elsewhere in the app (i18n.ts `names: "Shelly & Gil"`).
  'גיל': 'Gil',
  'שלי': 'Shelly',
  // Every table name is "שולחן NN" - always translate the word itself.
  'שולחן': 'Table',
  // Common guest-category / relationship words.
  'משפחה': 'Family',
  'משפחת': 'Family',
  'חברים': 'Friends',
  'חבר': 'Friend',
  'חברה': 'Friend',
  'עבודה': 'Work',
  'עבודת': 'Work',
  'קולגות': 'Colleagues',
  'שכנים': 'Neighbors',
  'שכן': 'Neighbor',
  'קרובים': 'Relatives',
  'קרוב': 'Relative',
  'צבא': 'Army',
  'לימודים': 'School',
  'תואר': 'Degree',
  'אוניברסיטה': 'University',
  'הורים': 'Parents',
  'הורי': 'Parents of',
  'דודה': 'Aunt',
  'סבא': 'Grandpa',
  'סבתא': 'Grandma',
  // Very common Israeli first names (best-effort coverage, not exhaustive).
  'אברהם': 'Avraham', 'אבי': 'Avi', 'אביב': 'Aviv', 'אבינועם': 'Avinoam',
  'אדם': 'Adam', 'אהוד': 'Ehud', 'אורי': 'Uri', 'אורית': 'Orit',
  'איתי': 'Itai', 'איתן': 'Eitan', 'אלה': 'Ella', 'אלון': 'Alon',
  'אלי': 'Eli', 'אליה': 'Elya', 'אלישע': 'Elisha', 'אמיר': 'Amir',
  'אסף': 'Asaf', 'אסתר': 'Esther', 'ארז': 'Erez', 'בן': 'Ben',
  'בניה': 'Benaya', 'בר': 'Bar', 'גבריאל': 'Gabriel', 'גדי': 'Gadi',
  'גיא': 'Guy', 'דן': 'Dan', 'דנה': 'Dana', 'דניאל': 'Daniel',
  'דניאלה': 'Daniella', 'דוד': 'David', 'הדר': 'Hadar', 'הילה': 'Hila',
  'הראל': 'Harel', 'ורד': 'Vered', 'זיו': 'Ziv', 'חן': 'Chen',
  'חנה': 'Hana', 'טל': 'Tal', 'טליה': 'Talia', 'יאיר': 'Yair',
  'יהונתן': 'Yehonatan', 'יהודה': 'Yehuda', 'יוסף': 'Yosef', 'יונתן': 'Yonatan',
  'יעל': 'Yael', 'יעקב': 'Yaakov', 'יפית': 'Yafit', 'יצחק': 'Yitzhak',
  'ליאור': 'Lior', 'ליאת': 'Liat', 'לילך': 'Lilach', 'מאיה': 'Maya',
  'מיכאל': 'Michael', 'מיכל': 'Michal', 'מירי': 'Miri', 'מירב': 'Meirav',
  'משה': 'Moshe', 'מתן': 'Matan', 'נגה': 'Noga', 'נדב': 'Nadav',
  'נועה': 'Noa', 'נועם': 'Noam', 'נטע': 'Neta', 'ניר': 'Nir',
  'נעמה': 'Naama', 'נתן': 'Natan', 'עדי': 'Adi', 'עידו': 'Ido',
  'עומר': 'Omer', 'עופר': 'Ofer', 'עינב': 'Einav', 'עמית': 'Amit',
  'עמרי': 'Omri', 'רועי': 'Roei', 'רון': 'Ron', 'רונית': 'Ronit',
  'רוני': 'Roni', 'רותם': 'Rotem', 'רחל': 'Rachel', 'רני': 'Rani',
  'שולי': 'Shuli', 'שחר': 'Shachar', 'שי': 'Shai', 'שירה': 'Shira',
  'שלמה': 'Shlomo', 'שקד': 'Shaked', 'שרה': 'Sarah', 'תום': 'Tom',
  'תמר': 'Tamar',
};

// Plain consonant map, used only when a whole word isn't in KNOWN_WORDS
// above. Final-form letters (ך ם ן ף ץ) map the same as their base form.
const LETTER_MAP: Record<string, string> = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'ch', 'ט': 't', 'י': 'i', 'כ': 'kh', 'ך': 'kh', 'ל': 'l',
  'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '',
  'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r',
  'ש': 'sh', 'ת': 't',
};

const HAS_HEBREW_LETTER = /[֐-׿]/;

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

function transliterateWord(word: string): string {
  if (!HAS_HEBREW_LETTER.test(word)) {
    // Already Latin/digits/punctuation (e.g. "07", "-") - leave untouched.
    return word;
  }
  const known = KNOWN_WORDS[word];
  if (known) return known;

  let result = '';
  for (const char of word) {
    result += LETTER_MAP[char] ?? char;
  }
  return capitalize(result);
}

// Splits on whitespace/hyphens so each word is looked up/mapped on its own
// (matches how KNOWN_WORDS and table names like "שולחן 07" are structured),
// then rejoins with the original separators.
export function transliterateHebrew(text: string): string {
  if (!text) return text;
  return text
    .split(/(\s+|-)/)
    .map((piece) => (/^(\s+|-)$/.test(piece) ? piece : transliterateWord(piece)))
    .join('');
}
