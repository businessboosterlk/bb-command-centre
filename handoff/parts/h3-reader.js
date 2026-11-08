/* H3 sentence reader. Written by BB Crew (mould handoff-js-part, brief items-handoff-h3.jsonl, 8 Nov 2026), judged and
   fixed by Claude: upper case day suffixes, short month names, hyphens read as spaces, client names masked before the
   day words, "can you" and "please" off the title. Pass mark: handoff/parts/h3-reader.test.mjs, 30 sentences. */
(function () {
  'use strict';

  // ── helpers ──────────────────────────────────────────────────────────
  const DAY_MS = 86400000;

  /** Normalise a string: uppercase, collapse whitespace, trim */
  function norm(s) {
    return s.toUpperCase().replace(/\s+/g, ' ').trim();
  }

  /** Remove punctuation and hyphens for client matching */
  function stripPunct(s) {
    return s.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  /** Parse a date string like '2026-11-09' into a Date at noon UTC */
  function parseDate(str) {
    const parts = str.split('-');
    return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0));
  }

  /** Format a Date as 'YYYY-MM-DD' */
  function fmtDate(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Add N days to a Date, return new Date */
  function addDays(d, n) {
    const nd = new Date(d);
    nd.setUTCDate(nd.getUTCDate() + n);
    return nd;
  }

  /** Day-of-week 0=Mon … 6=Sun */
  function dow(d) {
    return (d.getUTCDay() + 6) % 7;
  }

  /** Next occurrence of a weekday (0=Mon … 6=Sun) counting today */
  function nextWeekday(from, targetDow) {
    const cur = dow(from);
    const diff = (targetDow - cur + 7) % 7;
    return addDays(from, diff);
  }

  /** Monday of the week containing `d` (Mon=0) */
  function mondayOf(d) {
    return addDays(d, -dow(d));
  }

  const WORD_NUMS = {
    'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
    'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10
  };

  const MONTHS = {
    'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4,
    'MAY': 5, 'JUNE': 6, 'JULY': 7, 'AUGUST': 8,
    'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12
  };
  const MONTH_ABBRS = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
  };

  const WEEKDAYS = {
    'MONDAY': 0, 'TUESDAY': 1, 'WEDNESDAY': 2, 'THURSDAY': 3,
    'FRIDAY': 4, 'SATURDAY': 5, 'SUNDAY': 6,
    'MON': 0, 'TUE': 1, 'TUES': 1, 'WED': 2, 'THU': 3, 'THUR': 3, 'THURS': 3,
    'FRI': 4, 'SAT': 5, 'SUN': 6
  };

  // ── people extraction ────────────────────────────────────────────────
  function extractPeople(text, peopleList) {
    const found = [];
    const seen = new Set();
    // Build a regex that matches any person name as a whole word, case-insensitive.
    // We need to process in order of appearance, so we scan the text word by word.
    const words = text.split(/\b/); // split on word boundaries, keeps punctuation
    const upperText = text.toUpperCase();

    // We'll walk through the text and try to match each person name at current position.
    let i = 0;
    while (i < upperText.length) {
      let matched = null;
      let matchedLen = 0;
      for (const p of peopleList) {
        const name = p.name.toUpperCase();
        // Must match as a whole word. Check that the substring matches and is bounded by non-word chars or string ends.
        if (upperText.startsWith(name, i)) {
          const afterIdx = i + name.length;
          const beforeOk = i === 0 || /\W/.test(upperText[i - 1]);
          const afterOk = afterIdx === upperText.length || /\W/.test(upperText[afterIdx]);
          if (beforeOk && afterOk) {
            // Prefer longest match
            if (name.length > matchedLen) {
              matched = p;
              matchedLen = name.length;
            }
          }
        }
      }
      if (matched) {
        if (!seen.has(matched.id)) {
          found.push(matched.id);
          seen.add(matched.id);
        }
        i += matchedLen;
      } else {
        i++;
      }
    }
    return found;
  }

  // ── day resolution ───────────────────────────────────────────────────
  function resolveDay(text, todayStr) {
    const today = parseDate(todayStr);
    const upper = text.toUpperCase();
    const words = upper.split(/[\s,;:!?.]+/).filter(Boolean);

    // Immediate keywords
    if (/\b(TODAY|TONIGHT|END OF DAY|EOD|BY CLOSE)\b/.test(upper)) {
      return todayStr;
    }
    if (/\b(TOMORROW|TMRW)\b/.test(upper)) {
      return fmtDate(addDays(today, 1));
    }

    // "next <weekday>"
    const nextWdMatch = upper.match(/\bNEXT\s+(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT|SUN)\b/);
    if (nextWdMatch) {
      const targetDow = WEEKDAYS[nextWdMatch[1]];
      const mon = mondayOf(today);
      const nextWeekMon = addDays(mon, 7);
      const target = addDays(nextWeekMon, targetDow);
      return fmtDate(target);
    }

    // Plain weekday (full or abbr): "Friday", "on Wed", "by thursday"
    const wdMatch = upper.match(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT|SUN)\b/);
    if (wdMatch) {
      const targetDow = WEEKDAYS[wdMatch[1]];
      return fmtDate(nextWeekday(today, targetDow));
    }

    // "this week", "end of week", "by the weekend" → Friday of this week
    if (/\b(THIS WEEK|END OF WEEK|BY THE WEEKEND)\b/.test(upper)) {
      const fri = nextWeekday(today, 4); // 4 = Friday
      return fmtDate(fri);
    }

    // "next week" → Monday of next week
    if (/\bNEXT WEEK\b/.test(upper)) {
      const mon = mondayOf(today);
      return fmtDate(addDays(mon, 7));
    }

    // "in N days" / "in a week"
    const inDaysMatch = upper.match(/\bIN\s+(A|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)\s+(DAY|DAYS)\b/);
    if (inDaysMatch) {
      let n;
      if (inDaysMatch[1] === 'A') n = 1;
      else if (WORD_NUMS[inDaysMatch[1]]) n = WORD_NUMS[inDaysMatch[1]];
      else n = parseInt(inDaysMatch[1], 10);
      return fmtDate(addDays(today, n));
    }
    if (/\bIN A WEEK\b/.test(upper)) {
      return fmtDate(addDays(today, 7));
    }

    // Date patterns: "12 Nov", "12th November", "Nov 12", "November 12th", "12/11", "12/11/2026"
    const datePatterns = [
      // 12 Nov / 12th November
      /\b(\d{1,2})(?:ST|ND|RD|TH)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/,
      // Nov 12 / November 12th
      /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})(?:ST|ND|RD|TH)?\b/,
      // 12/11 or 12/11/2026
      /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/
    ];

    for (const re of datePatterns) {
      const m = upper.match(re);
      if (m) {
        let day, month, year;
        const monthOf = w => MONTHS[w] || MONTH_ABBRS[w];
        if (m[1] && m[2] && monthOf(m[2])) {
          // day month
          day = parseInt(m[1], 10);
          month = MONTHS[m[2]] || MONTH_ABBRS[m[2]];
          year = today.getUTCFullYear();
        } else if (monthOf(m[1]) && m[2]) {
          // month day
          month = MONTHS[m[1]] || MONTH_ABBRS[m[1]];
          day = parseInt(m[2], 10);
          year = today.getUTCFullYear();
        } else if (m[1] && m[2] && !m[3]) {
          // day/month
          day = parseInt(m[1], 10);
          month = parseInt(m[2], 10);
          year = today.getUTCFullYear();
        } else if (m[1] && m[2] && m[3]) {
          // day/month/year
          day = parseInt(m[1], 10);
          month = parseInt(m[2], 10);
          year = parseInt(m[3], 10);
        }
        if (day && month) {
          const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
          if (candidate < today) {
            candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
          }
          return fmtDate(candidate);
        }
      }
    }

    // "the 15th" / "on the 3rd"
    const theDayMatch = upper.match(/\bTHE\s+(\d{1,2})(?:ST|ND|RD|TH)?\b/);
    if (theDayMatch) {
      const day = parseInt(theDayMatch[1], 10);
      const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day, 12, 0, 0));
      if (thisMonth >= today) return fmtDate(thisMonth);
      const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day, 12, 0, 0));
      return fmtDate(nextMonth);
    }

    return '';
  }

  // ── client extraction ────────────────────────────────────────────────
  function extractClient(text, clients, peopleNames) {
    const upperText = text.toUpperCase();
    let bestMatch = null;
    let bestLen = 0;

    for (const c of clients) {
      const cName = c.name.toUpperCase();
      const cStripped = stripPunct(c.name);
      // 1. Full name match ignoring punctuation/hyphens
      const strippedText = stripPunct(text);
      if ((' ' + strippedText + ' ').includes(' ' + cStripped + ' ')) {
        if (cName.length > bestLen) {
          bestMatch = c.id;
          bestLen = cName.length;
        }
      }

      // 2. Initials for names with >=3 words
      const cWords = cName.split(/\s+/);
      if (cWords.length >= 3) {
        const initials = cWords.map(w => w[0]).join('');
        // Match as a whole word in the original text (case-insensitive)
        const initRegex = new RegExp('\\b' + initials + '\\b', 'i');
        if (initRegex.test(text) && initials.length > bestLen) {
          bestMatch = c.id;
          bestLen = initials.length;
        }
      }

      // 3. First word match (>=4 letters, unique among clients)
      const firstWord = cWords[0];
      if (firstWord.length >= 4) {
        // Check uniqueness
        const sameFirst = clients.filter(cl => cl.name.toUpperCase().split(/\s+/)[0] === firstWord);
        if (sameFirst.length === 1) {
          // Check it appears as a whole word and is not a person name
          const wordRegex = new RegExp('\\b' + firstWord + '\\b', 'i');
          if (wordRegex.test(text)) {
            // Ensure it's not a person name
            const isPerson = peopleNames.some(pn => pn.toUpperCase() === firstWord);
            if (!isPerson && firstWord.length > bestLen) {
              bestMatch = c.id;
              bestLen = firstWord.length;
            }
          }
        }
      }
    }

    return bestMatch;
  }

  // ── title extraction ─────────────────────────────────────────────────
  function extractTitle(text, peopleList, dueStr, clientId, clients) {
    let t = text;

    // Remove leading names and joining words
    const peopleNames = peopleList.map(p => p.name);
    // Build a regex that matches a sequence of: person name, optional possessive "'s", and joining words (and, &, comma, colon, "can you", "please")
    const namePatterns = peopleNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (namePatterns) {
      const leadRegex = new RegExp(
        '^\\s*((?:' + namePatterns + ')(?:\\s*\'s)?\\s*(?:,|and|&|\\s+can\\s+you\\s*|\\s+please\\s*|:\\s*|\\s+)*)+',
        'i'
      );
      t = t.replace(leadRegex, '');
    }

    // Remove day words with their little words
    const dayPhrases = [
      'today', 'tonight', 'end of day', 'eod', 'by close',
      'tomorrow', 'tmrw',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
      'next\\s+\\w+', 'this week', 'end of week', 'by the weekend', 'next week',
      'in\\s+(a|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(day|days)',
      'in a week',
      '\\d{1,2}(?:st|nd|rd|th)?\\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)',
      '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\s+\\d{1,2}(?:st|nd|rd|th)?',
      '\\d{1,2}/\\d{1,2}(?:/\\d{4})?',
      'the\\s+\\d{1,2}(?:st|nd|rd|th)?'
    ];
    const dayRegex = new RegExp(
      '\\b(?:by|on|before|for|until|due)\\s+(' + dayPhrases.join('|') + ')\\b|\\b(' + dayPhrases.join('|') + ')\\b',
      'gi'
    );
    t = t.replace(dayRegex, '');

    // Clean up spaces and punctuation
    t = t.replace(/\s+/g, ' ').trim();
    // Remove leading/trailing commas, colons, semicolons
    t = t.replace(/^[,\s:;]+/, '').replace(/[,\s:;]+$/, '');
    // Capitalise first letter
    if (t.length > 0) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    // Remove trailing full stop
    t = t.replace(/\.$/, '');

    if (!t) {
      return text.trim();
    }
    return t;
  }

  // ── main function ────────────────────────────────────────────────────
  /* Claude fix: a client name is never read as a day ("Sun Zapper" is not Sunday), so every client name is masked
     before the day words are read or taken out of the title, and put back afterwards. */
  function maskClients(text, clients) {
    const kept = [];
    let t = String(text || '');
    const names = clients.map(c => c.name).sort((a, b) => b.length - a.length);
    for (const n of names) {
      const words = n.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!words.length) continue;
      const re = new RegExp('\\b' + words.join('[\\s\\-.]*') + '\\b', 'gi');
      t = t.replace(re, m => { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0001'; });
    }
    return { t, put: x => x.replace(/\u0001(\d+)\u0001/g, (_, i) => kept[+i]) };
  }

  function hoRead(text, ctx) {
    const peopleList = ctx.people || [];
    const clients = ctx.clients || [];
    const today = ctx.today;
    text = String(text || '');

    const peopleIds = extractPeople(text, peopleList);
    const masked = maskClients(text, clients);
    const due = resolveDay(masked.t, today);
    const peopleNames = peopleList.filter(p => peopleIds.includes(p.id)).map(p => p.name);
    const clientId = extractClient(text, clients, peopleNames);
    let title = masked.put(extractTitle(masked.t, peopleList, due, clientId, clients));
    /* Claude fix: "can you" and "please" after the names come off the front too */
    title = title.replace(/^(?:can you|could you|please|pls)\s+/i, '').replace(/^(?:please)\s+/i, '');
    /* Claude fix (round 2): a "please" at the end comes off too */
    title = title.replace(/[\s,]+(?:please|pls)[\s.!]*$/i, '');
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1); else title = text.trim();

    return {
      people: peopleIds,
      due: due,
      client: clientId,
      title: title
    };
  }

  // Assign to global
  (typeof window !== 'undefined' ? window : globalThis).hoRead = hoRead;
})();
