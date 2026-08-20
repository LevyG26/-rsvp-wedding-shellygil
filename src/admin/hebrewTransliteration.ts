// Best-effort Hebrew -> Latin transliteration, used only by the seating
// Excel export's "export in English" option (see SeatingSection.tsx /
// exportSeatingChart.ts). Guest names, categories, and sides are free text
// Gil typed in Hebrew - there's no separate English field anywhere in the
// data model - and Hebrew is normally written without nikud (vowel points),
// so there is no way to algorithmically recover which vowels belong between
// consonants from the text alone (e.g. unpointed "דוד" could be "David",
// "Dvir", or "Dod" - all valid readings of the same three letters). This
// can only ever be an approximation, not a real translation - a per-guest
// manual English-name override is the only way to guarantee every name is
// exactly right.
//
// Three layers, in order:
// 1. KNOWN_WORDS - an exact-match dictionary of words we can get right with
//    confidence: the couple's own two side names (must match the English
//    spelling already used elsewhere in the app - i18n.ts's `names` key),
//    "שולחן" (every table name is "שולחן NN"), guest-category/relationship
//    words, common Israeli first names AND surnames (including Sephardi/
//    Mizrahi/North-African surnames, since a letter-by-letter fallback on a
//    surname like "לוי" produced nonsense like "Lvi" instead of "Levi"),
//    and common French-origin first names as they're spelled in Hebrew
//    (many Israeli guests of French/North-African background have names
//    that are a Hebrew phonetic spelling of a French name, e.g. "ז'קלין"
//    for Jacqueline - these need their real French/French-transliterated
//    spelling, not a literal letter-for-letter guess).
// 2. DIGRAPHS - geresh-marked letter pairs (ג׳/ז׳/צ׳) used specifically to
//    write sounds foreign to Hebrew (zh/j/ch) - almost always a sign the
//    word is a loanword or foreign name. Applied before the plain per-
//    letter fallback so a French name that ISN'T in KNOWN_WORDS at least
//    gets its consonants right (e.g. "ז'ראר" -> "zhrr" is wrong either way
//    without inferred vowels, but "zh" instead of "z" + apostrophe still
//    reads closer to the real sound than a plain letter map would).
// 3. LETTER_MAP - a plain per-letter consonant fallback for anything not
//    covered above - will often read oddly (no inferred vowels beyond what
//    י/ו contribute) but at least produces *something* readable in Latin
//    script rather than leaving the cell blank or crashing the export.
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
  'אריאלה': 'Ariella', 'אריאל': 'Ariel',
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
  'תמר': 'Tamar', 'שמעון': 'Shimon', 'חיים': 'Chaim', 'עמי': 'Ami',
  'שושן': 'Shoshan', 'ציון': 'Tzion',
  // Additional common Israeli/Jewish first names (male and female).
  'גלעד': 'Gilad', 'אבנר': 'Avner', 'אביעד': 'Aviad', 'אביחי': 'Avichai',
  'אלעד': 'Elad', 'אסא': 'Asa', 'ברוך': 'Baruch', 'גדעון': 'Gideon',
  'גל': 'Gal', 'דור': 'Dor', 'דורון': 'Doron', 'זוהר': 'Zohar',
  'חגי': 'Chagai', 'טוביה': 'Tuvia', 'יגאל': 'Yigal', 'ידידיה': 'Yedidya',
  'יובל': 'Yuval', 'יונה': 'Yona', 'יורם': 'Yoram', 'יזהר': 'Yizhar',
  'ירון': 'Yaron', 'ישי': 'Yishai', 'כפיר': 'Kfir', 'מנחם': 'Menachem',
  'מנשה': 'Menashe', 'נריה': 'Nerya', 'נתנאל': 'Netanel', 'סהר': 'Sahar',
  'עדן': 'Eden', 'עוז': 'Oz', 'עוזי': 'Uzi', 'עידן': 'Idan',
  'עציון': 'Etzion', 'פנחס': 'Pinchas', 'צביקה': 'Tzvika', 'צחי': 'Tzachi',
  'קובי': 'Kobi', 'רם': 'Ram', 'רפי': 'Rafi', 'שאול': 'Shaul',
  'שגיא': 'Sagi', 'תומר': 'Tomer', 'אור': 'Or', 'אורן': 'Oren',
  'בועז': 'Boaz', 'אלירן': 'Eliran', 'אביתר': 'Evyatar', 'אסי': 'Asi',
  'אביגיל': 'Avigail', 'אביטל': 'Avital', 'אורנה': 'Orna', 'אורלי': 'Orly',
  'אילנה': 'Ilana', 'אילת': 'Eilat', 'גליה': 'Galia', 'גפן': 'Gefen',
  'דבורה': 'Devora', 'הודיה': 'Hodaya', 'הילי': 'Hili', 'ורדית': 'Vardit',
  'חגית': 'Chagit', 'חופית': 'Chofit', 'טובה': 'Tova', 'יונית': 'Yonit',
  'יפה': 'Yafa', 'יערה': 'Yaara', 'כרמל': 'Carmel', 'לאה': 'Leah',
  'ליטל': 'Lital', 'ליהי': 'Lihi', 'מעיין': 'Maayan', 'נדין': 'Nadine',
  'נופר': 'Nofar', 'נחמה': 'Nechama', 'סיגל': 'Sigal', 'סתיו': 'Stav',
  'עינת': 'Einat', 'ענבל': 'Inbal', 'פנינה': 'Penina', 'צופיה': 'Tzofia',
  'קרן': 'Keren', 'רבקה': 'Rivka', 'רות': 'Ruth', 'שולמית': 'Shulamit',
  'שני': 'Shani', 'תהילה': 'Tehila', 'תמי': 'Tami', 'הגר': 'Hagar',
  'זהבה': 'Zahava', 'מרים': 'Miriam', 'שירי': 'Shiri', 'עדינה': 'Adina',
  'ענת': 'Anat', 'עליזה': 'Aliza', 'אסתי': 'Esti',
  // Additional common Israeli/Jewish surnames.
  'אבידן': 'Avidan', 'אביטן': 'Avitan', 'אדלר': 'Adler', 'אלוני': 'Aloni',
  'בוסקילה': 'Bouskila', 'בן שמעון': 'Ben Shimon', 'בן צור': 'Ben Tzur',
  'גורן': 'Goren', 'דרוקר': 'Drucker', 'הלוי': 'HaLevy', 'וקנין': 'Vaknin',
  'כרמי': 'Karmi', 'לחיאני': 'Lachiani', 'מלול': 'Malul', 'נבון': 'Navon',
  'ניסים': 'Nissim', 'סומך': 'Somekh', 'פדידה': 'Pdida', 'קדוש': 'Kadosh',
  'רז': 'Raz', 'שגב': 'Sagiv', 'אביטבול': 'Avitbol', 'גבע': 'Geva',
  'עזרן': 'Ezran', 'מסיקה': 'Messika',
  // The venue's own production/design team (from venueSeatingLayout.ts's
  // source comment) - real names Gil will actually run into in exports.
  'שוסטרמן': 'Shusterman', 'טייר': 'Tayar',
  // Common Israeli surnames - Ashkenazi, Sephardi, Mizrahi and North
  // African, spelled the way they're standardly romanized (not a literal
  // letter map, which is exactly what produced Gil's "Levi" -> "Lvi" bug).
  'כהן': 'Cohen', 'לוי': 'Levy', 'מזרחי': 'Mizrahi', 'פרץ': 'Peretz',
  'ביטון': 'Bitton', 'עמר': 'Amar', 'מלכה': 'Malka', 'אזולאי': 'Azoulay',
  'טולדנו': 'Toledano', 'שוקרון': 'Chocron', 'אלמליח': 'Elmaleh',
  'פרידמן': 'Friedman', 'כץ': 'Katz', 'רוזן': 'Rosen', 'גולן': 'Golan',
  'שפירא': 'Shapira', 'אשכנזי': 'Ashkenazi', 'ספרדי': 'Sephardi',
  'חדד': 'Haddad', 'דהן': 'Dahan', 'אוחיון': 'Ohayon', 'חמו': 'Hamo',
  'סויסה': 'Suissa', 'גבאי': 'Gabay', 'נחום': 'Nachum', 'עוזרי': 'Ozeri',
  'מור': 'Mor', 'ברק': 'Barak', 'פלד': 'Peled', 'שרון': 'Sharon',
  'ליבוביץ': 'Leibowitz', 'גרין': 'Green', 'שוורץ': 'Schwartz',
  'וייס': 'Weiss', 'קליין': 'Klein', 'רבין': 'Rabin', 'חסון': 'Hasson',
  'אוחנה': 'Ohana', 'דנינו': 'Danino', 'אסולין': 'Assouline',
  'בוזגלו': 'Bouzaglo', 'אלבז': 'Elbaz', 'נקש': 'Nakash', 'אדרי': 'Edri',
  'אסרף': 'Assaraf', 'בכר': 'Bekhor', 'טובול': 'Toubol', 'כדורי': 'Kadouri',
  'פינטו': 'Pinto', 'סבן': 'Saban', 'מויאל': 'Moyal', 'עמאר': 'Amar',
  'אוחיו': 'Ohayo', 'בן חמו': 'Ben Hamo',
  // Common French-origin first names, as spelled in Hebrew - a plain
  // letter map gets these badly wrong (French spelling conventions don't
  // map to Hebrew consonant sounds at all), so these need their real
  // French spelling looked up directly.
  "ז'קלין": 'Jacqueline', 'מישל': 'Michel', 'אנדרה': 'André',
  'פייר': 'Pierre', 'שרל': 'Charles', 'קלוד': 'Claude', 'רנה': 'René',
  'איב': 'Yves', 'דומיניק': 'Dominique', 'סילבי': 'Sylvie', 'אן': 'Anne',
  "ז'אן": 'Jean', "ז'אנין": 'Jeannine', 'מוריס': 'Maurice',
  "ז'ראר": 'Gérard', 'אליאן': 'Eliane', 'ניקול': 'Nicole', 'לוסי': 'Lucie',
  "ז'ילברט": 'Gilberte', 'ארמנד': 'Armand', 'רולן': 'Roland',
  'מרסל': 'Marcel', "ז'וזה": 'José', 'אלן': 'Alain', 'פרנסין': 'Francine',
  'עמנואל': 'Emmanuel', 'פטריק': 'Patrick', 'אודט': 'Odette',
  "ז'וזיאן": 'Josiane', 'קורין': 'Corinne', 'ליליאן': 'Liliane',
  'רוז': 'Rose', "ז'ואל": 'Joël', 'פרנק': 'Frank', 'ברנאר': 'Bernard',
  'ויויאן': 'Vivian', "ז'קי": 'Jacky', "ז'ילי": 'Gilly',
};

// Plain consonant map, used only when a whole word isn't in KNOWN_WORDS
// above and doesn't start with one of the DIGRAPHS below. Final-form
// letters (ך ם ן ף ץ) map the same as their base form.
const LETTER_MAP: Record<string, string> = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'ch', 'ט': 't', 'י': 'i', 'כ': 'kh', 'ך': 'kh', 'ל': 'l',
  'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '',
  'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r',
  'ש': 'sh', 'ת': 't',
};

// Geresh-marked letters exist specifically to write sounds foreign to
// Hebrew - almost always a loanword or a name of foreign (often French)
// origin - so these need to be caught before the plain per-letter map
// below, which has no idea a geresh changes the sound at all.
const DIGRAPHS: [string, string][] = [
  ["ג'", 'j'],
  ["ז'", 'zh'],
  ["צ'", 'ch'],
];

const HAS_HEBREW_LETTER = /[֐-׿]/;

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

function transliterateWord(word: string): string {
  // Normalizes the Hebrew geresh punctuation mark (׳, U+05F3) to a plain
  // apostrophe first, so "ז׳קלין" and "ז'קלין" (both real-world spellings
  // Gil's guest sheet could contain) hit the same KNOWN_WORDS/DIGRAPHS
  // entries.
  const normalized = word.replace(/׳/g, "'");

  if (!HAS_HEBREW_LETTER.test(normalized)) {
    // Already Latin/digits/punctuation (e.g. "07", "-") - leave untouched.
    return word;
  }
  const known = KNOWN_WORDS[normalized];
  if (known) return known;

  let result = '';
  let remaining = normalized;
  let isWordStart = true;
  while (remaining.length > 0) {
    const digraph = DIGRAPHS.find(([hebrew]) => remaining.startsWith(hebrew));
    if (digraph) {
      result += digraph[1];
      remaining = remaining.slice(digraph[0].length);
      isWordStart = false;
      continue;
    }
    const char = remaining[0];
    // א and ע are silent/vowel-carrier letters, normally dropped (see
    // LETTER_MAP) - but dropping them at the very start of a word leaves
    // nothing to capitalize (e.g. "עדינה" -> "" + "dinה..." -> "dinh",
    // never getting a capital letter at all, which is exactly the bug Gil
    // flagged: every transliterated name must visibly start with a capital
    // letter). 'a' is the most common word-initial vowel sound for both
    // letters in practice (Avi, Adam, Adina, Amit...), so it's the least-
    // wrong single default here.
    if (isWordStart && (char === 'א' || char === 'ע')) {
      result += 'a';
    } else {
      result += LETTER_MAP[char] ?? char;
    }
    remaining = remaining.slice(1);
    isWordStart = false;
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
