import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getStorage } from '../../platform/storage';

const LANGUAGE_KEY = 'satloc.shellV2.language';
const SUPPORTED_LANGUAGES = ['en', 'he'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value != null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** The language chosen last time (see the persistence below), or 'en' if none/invalid/storage unavailable. */
function storedLanguage(): SupportedLanguage {
  const stored = getStorage().getItem(LANGUAGE_KEY);
  return isSupportedLanguage(stored) ? stored : 'en';
}

/**
 * Shell V2's i18n setup — English (default) and Hebrew (RTL). Hebrew vocabulary matches the
 * Design Gate's Train mockups (docs/design/gate-01/{a,b}/train.html) where a term was already
 * established there (workspace names, Altitude/Velocity, the search placeholder wording), so
 * the running app doesn't introduce a second, inconsistent Hebrew vocabulary.
 *
 * Technical/proper-noun tokens (NORAD, satellite names, ground station names) stay in Latin
 * script even in the Hebrew resource bundle, same as the Design Gate mockups did — those aren't
 * translated, just wrapped in `.sl-bidi-isolate` at the call site so they don't get reordered by
 * the bidi algorithm inside an RTL sentence.
 *
 * The chosen language persists across sessions (see `storedLanguage`/the `languageChanged`
 * listener below), through the same storage abstraction the rest of the app uses.
 */
const resources = {
  en: {
    translation: {
      topbar: {
        searchPlaceholder: 'Jump to satellite, task, or command…',
        switchLanguage: 'עברית',
      },
      rail: {
        label: 'Workspace',
        explore: 'Explore',
        plan: 'Plan',
        train: 'Train',
        debrief: 'Debrief',
      },
      inspector: {
        label: 'Inspector',
        empty: 'Select a satellite to see its details.',
        norad: 'NORAD',
        altitude: 'Altitude',
        velocity: 'Velocity',
        latitude: 'Latitude',
        longitude: 'Longitude',
        period: 'Period',
        elementsAge: 'Elements age',
        display: 'Display',
        orbitPath: 'Orbit path',
        groundTrack: 'Ground track',
        footprint: 'Footprint',
      },
      dock: {
        catalog: 'Catalog ({{count}})',
      },
      plan: {
        title: 'Scenario 01 — Imaging Opportunities',
        disclaimer:
          'Asteria-1 is a fictional satellite invented for training. Its orbit, storage/downlink figures, and ground stations are simulated or assumed, not real telemetry from any ImageSat International satellite.',
        note: 'Browse only for now — picking an opportunity to build a real plan is later work.',
        offNadir: 'Off-nadir {{deg}}°',
        daylightYes: 'Day',
        daylightNo: 'Night',
        clean: 'OK',
        loadError: "Couldn't compute imaging opportunities: {{message}}",
        empty: 'No imaging opportunities found in the search window.',
        addToDraft: 'Add to plan',
        removeFromDraft: 'Remove',
        draftTitle: 'Draft plan',
        draftEmpty: 'No candidates added yet — add opportunities above to build a draft plan.',
        storageUsed: '{{used}} / {{total}} GB',
      },
      train: {
        title: 'Scenario 01',
        disclaimer:
          'Asteria-1 is a fictional satellite invented for training. Its orbit, storage/downlink figures, and ground stations are simulated or assumed, not real telemetry from any ImageSat International satellite.',
        play: 'Play',
        pause: 'Pause',
        rate: 'Rate',
        storage: 'Storage',
        tasks: 'Tasks',
        noTasksYet: 'No tasks yet — waiting for the scenario to start.',
        timelineError: "Couldn't compute this run's schedule: {{message}}",
        taskStatus: {
          planned: 'Planned',
          active: 'Active',
          completed: 'Done',
          failed: 'Failed',
        },
        taskLabels: {
          'capture-1': 'Imaging — PAN',
          'downlink-1': 'Downlink — GS-Home',
        },
      },
      debrief: {
        title: 'Scenario 01 — Debrief',
        note: 'Replays the same real Scenario 01 timeline Train runs, to completion — not a live run and not a chosen session.',
        loadError: "Couldn't compute this run's debrief: {{message}}",
        loading: 'Computing the replay…',
        empty: 'No events to debrief yet.',
        truthColumn: 'Truth State',
        observablesColumn: 'Operator Observables',
        diverges: 'Lag',
        activeContacts: 'Active: {{ids}}',
        noActiveContacts: 'No active contacts',
        confirmedContacts: 'Confirmed: {{ids}}',
        noConfirmedContacts: 'Not yet confirmed',
        storage: 'Storage: {{gb}} GB',
        events: {
          taskStarted: 'Task started — {{task}}',
          taskCompleted: 'Task completed — {{task}} ({{outcome}})',
          dataProductStored: 'Data product stored — {{id}} ({{mode}}, {{sizeGB}} GB)',
          contactAcquired: 'Contact acquired — {{contactId}}',
          contactLost: 'Contact lost — {{contactId}}',
          downlinkCompleted: 'Downlink completed — {{dataProductId}} via {{contactId}}',
          commandAccepted: 'Command accepted — {{commandId}}',
          commandRejected: 'Command rejected — {{commandId}} ({{reason}})',
          commandExecuted: 'Command executed — {{commandId}}',
        },
      },
      globe: {
        starting: 'Starting the 3D globe…',
        error: 'The 3D globe could not start: {{message}}',
      },
      palette: {
        label: 'Jump to satellite',
        close: 'Close',
        noResults: 'No satellites match.',
      },
      updates: {
        installingUnknown: 'Installing update…',
        installingWithPercent: 'Installing update {{percent}}%…',
        available: 'SatLoc {{version}} is available',
        failed: 'Update to {{version}} failed',
        install: 'install & restart',
        retry: 'retry',
        dismiss: 'Dismiss update notice',
        check: 'Check for updates',
        checkHint: 'Ask GitHub Releases whether a newer signed build exists',
        checking: 'Checking…',
        upToDate: 'Up to date',
        checkFailed: 'Check failed — retry',
        desktopOnly: 'Updates: desktop app only',
        desktopOnlyHint: 'Updates apply to the installed desktop app, not the browser version.',
      },
      settings: {
        title: 'Settings',
        language: { title: 'Language' },
        updates: {
          title: 'Updates',
          idle: 'Checked automatically a few seconds after start-up and every 6 hours.',
          checking: 'Checking GitHub Releases…',
          upToDate: 'Up to date ({{version}}).',
          available: 'Version {{version}} is available; you have {{current}}.',
          install: 'Install {{version}} and restart',
          installing: 'Downloading… The app restarts when done.',
          installingWithPercent: 'Downloading {{percent}}%… The app restarts when done.',
          error: 'Could not check: {{message}}',
          desktopOnly: 'Updates are only available in the installed desktop app.',
          lastCheck: 'Last check {{time}}.',
        },
        imagery: {
          title: 'Earth imagery',
          source: 'Imagery source',
          showing: 'Currently showing: {{source}}',
          probing: '(checking whether online imagery is reachable…)',
          ionToken: 'Cesium Ion access token (optional)',
          ionHint:
            'A free account at cesium.com/ion gives Bing satellite imagery and world terrain. Stored unencrypted on this device only; use a token limited to imagery and terrain.',
        },
        catalog: {
          title: 'Catalogue',
          pointsLimit: 'Points drawn at once (500–30,000)',
          pointsHint: 'Lower this on slower machines.',
          clear: 'Clear downloaded catalogue',
          clearing: 'Clearing…',
          clearHint: 'Deletes the downloaded catalogue groups; displayed groups are fetched again.',
        },
        help: {
          title: 'Help',
          copy: 'Copy diagnostics',
          copied: 'Copied',
          copyFailed: 'Copy failed',
          report: 'Report an issue',
          shortcutPalette: 'Jump to a satellite',
          shortcutEscape: 'Close a dialog or panel',
        },
        reset: {
          title: 'Reset',
          arm: 'Reset all settings…',
          confirm: 'Yes, reset everything and restart',
          cancel: 'Cancel',
          hint: 'Imagery choice, token, pinned satellites, language, and the downloaded catalogue — everything.',
        },
      },
    },
  },
  he: {
    translation: {
      topbar: {
        searchPlaceholder: 'קפיצה למשימה, לוויין או פקודה…',
        switchLanguage: 'English',
      },
      rail: {
        label: 'סביבת עבודה',
        explore: 'תצפית',
        plan: 'תכנון',
        train: 'אימון',
        debrief: 'תחקיר',
      },
      inspector: {
        label: 'מפקח',
        empty: 'בחר לוויין כדי לראות פרטים.',
        norad: 'NORAD',
        altitude: 'גובה',
        velocity: 'מהירות',
        latitude: 'קו רוחב',
        longitude: 'קו אורך',
        period: 'מחזור',
        elementsAge: 'גיל נתוני מסלול',
        display: 'תצוגה',
        orbitPath: 'מסלול',
        groundTrack: 'עקבת קרקע',
        footprint: 'טביעת רגל',
      },
      dock: {
        catalog: 'קטלוג ({{count}})',
      },
      plan: {
        title: 'תרחיש 01 — הזדמנויות צילום',
        disclaimer:
          'Asteria-1 הוא לוויין בדיוני שהומצא לצורכי אימון. המסלול, נתוני האחסון/הורדה ותחנות הקרקע שלו מדומים או מונחים, ואינם טלמטריה אמיתית מלוויין כלשהו של ImageSat International.',
        note: 'תצוגה בלבד בשלב זה — בחירת הזדמנות לבניית תוכנית אמיתית תגיע בהמשך.',
        offNadir: 'סטייה מהנדיר {{deg}}°',
        daylightYes: 'יום',
        daylightNo: 'לילה',
        clean: 'תקין',
        loadError: 'חישוב הזדמנויות הצילום נכשל: {{message}}',
        empty: 'לא נמצאו הזדמנויות צילום בחלון החיפוש.',
        addToDraft: 'הוסף לתוכנית',
        removeFromDraft: 'הסר',
        draftTitle: 'טיוטת תוכנית',
        draftEmpty: 'לא נוספו עדיין מועמדים — הוסף הזדמנויות למעלה כדי לבנות טיוטת תוכנית.',
        storageUsed: '{{used}} / {{total}} GB',
      },
      train: {
        title: 'תרחיש 01',
        disclaimer:
          'Asteria-1 הוא לוויין בדיוני שהומצא לצורכי אימון. המסלול, נתוני האחסון/הורדה ותחנות הקרקע שלו מדומים או מונחים, ואינם טלמטריה אמיתית מלוויין כלשהו של ImageSat International.',
        play: 'הפעל',
        pause: 'השהה',
        rate: 'קצב',
        storage: 'אחסון',
        tasks: 'משימות',
        noTasksYet: 'אין עדיין משימות — ממתין להתחלת התרחיש.',
        timelineError: 'חישוב לוח הזמנים של ההרצה נכשל: {{message}}',
        taskStatus: {
          planned: 'מתוזמן',
          active: 'פעיל',
          completed: 'בוצע',
          failed: 'נכשל',
        },
        taskLabels: {
          'capture-1': 'צילום — PAN',
          'downlink-1': 'הורדה — GS-Home',
        },
      },
      debrief: {
        title: 'תרחיש 01 — תחקיר',
        note: 'משחזר את אותו לוח הזמנים האמיתי של תרחיש 01 שאימון מריץ, עד לסיום — לא הרצה חיה ולא הרצה נבחרת.',
        loadError: 'חישוב התחקיר של ההרצה נכשל: {{message}}',
        loading: 'מחשב את השחזור…',
        empty: 'אין עדיין אירועים לתחקור.',
        truthColumn: 'מצב אמת',
        observablesColumn: 'תצפיות המפעיל',
        diverges: 'עיכוב',
        activeContacts: 'פעיל: {{ids}}',
        noActiveContacts: 'אין קשר פעיל',
        confirmedContacts: 'מאושר: {{ids}}',
        noConfirmedContacts: 'טרם אושר',
        storage: 'אחסון: {{gb}} GB',
        events: {
          taskStarted: 'משימה החלה — {{task}}',
          taskCompleted: 'משימה הושלמה — {{task}} ({{outcome}})',
          dataProductStored: 'מוצר נתונים אוחסן — {{id}} ({{mode}}, {{sizeGB}} GB)',
          contactAcquired: 'קשר נרכש — {{contactId}}',
          contactLost: 'קשר אבד — {{contactId}}',
          downlinkCompleted: 'הורדה הושלמה — {{dataProductId}} דרך {{contactId}}',
          commandAccepted: 'פקודה התקבלה — {{commandId}}',
          commandRejected: 'פקודה נדחתה — {{commandId}} ({{reason}})',
          commandExecuted: 'פקודה בוצעה — {{commandId}}',
        },
      },
      globe: {
        starting: 'מפעיל את הגלובוס…',
        error: 'הפעלת הגלובוס נכשלה: {{message}}',
      },
      palette: {
        label: 'קפיצה ללוויין',
        close: 'סגור',
        noResults: 'לא נמצאו לוויינים תואמים.',
      },
      updates: {
        installingUnknown: 'מתקין עדכון…',
        installingWithPercent: 'מתקין עדכון {{percent}}%…',
        available: 'SatLoc {{version}} זמין',
        failed: 'העדכון ל-{{version}} נכשל',
        install: 'התקן והפעל מחדש',
        retry: 'נסה שוב',
        dismiss: 'הסתר הודעת עדכון',
        check: 'בדוק עדכונים',
        checkHint: 'בודק ב-GitHub Releases אם קיימת גרסה חתומה חדשה יותר',
        checking: 'בודק…',
        upToDate: 'מעודכן',
        checkFailed: 'הבדיקה נכשלה — נסה שוב',
        desktopOnly: 'עדכונים: רק באפליקציה המותקנת',
        desktopOnlyHint: 'עדכונים חלים על האפליקציה המותקנת, לא על גרסת הדפדפן.',
      },
      settings: {
        title: 'הגדרות',
        language: { title: 'שפה' },
        updates: {
          title: 'עדכונים',
          idle: 'נבדק אוטומטית כמה שניות אחרי ההפעלה וכל 6 שעות.',
          checking: 'בודק ב-GitHub Releases…',
          upToDate: 'מעודכן ({{version}}).',
          available: 'גרסה {{version}} זמינה; אצלך מותקנת {{current}}.',
          install: 'התקן {{version}} והפעל מחדש',
          installing: 'מוריד… האפליקציה תופעל מחדש בסיום.',
          installingWithPercent: 'מוריד {{percent}}%… האפליקציה תופעל מחדש בסיום.',
          error: 'הבדיקה נכשלה: {{message}}',
          desktopOnly: 'עדכונים זמינים רק באפליקציה המותקנת.',
          lastCheck: 'בדיקה אחרונה {{time}}.',
        },
        imagery: {
          title: 'תמונת כדור הארץ',
          source: 'מקור התמונה',
          showing: 'מוצג כרגע: {{source}}',
          probing: '(בודק אם תמונות מקוונות נגישות…)',
          ionToken: 'טוקן גישה ל-Cesium Ion (אופציונלי)',
          ionHint:
            'חשבון חינמי ב-cesium.com/ion נותן תמונות לוויין של Bing ותבליט עולמי. נשמר ללא הצפנה במכשיר הזה בלבד; השתמש בטוקן המוגבל לתמונות ותבליט.',
        },
        catalog: {
          title: 'קטלוג',
          pointsLimit: 'נקודות מצוירות בו-זמנית (500–30,000)',
          pointsHint: 'הורד את הערך במחשבים איטיים.',
          clear: 'נקה קטלוג שהורד',
          clearing: 'מנקה…',
          clearHint: 'מוחק את קבוצות הקטלוג שהורדו; קבוצות מוצגות יורדו מחדש.',
        },
        help: {
          title: 'עזרה',
          copy: 'העתק דיאגנוסטיקה',
          copied: 'הועתק',
          copyFailed: 'ההעתקה נכשלה',
          report: 'דווח על תקלה',
          shortcutPalette: 'קפיצה ללוויין',
          shortcutEscape: 'סגירת חלון או פאנל',
        },
        reset: {
          title: 'איפוס',
          arm: 'אפס את כל ההגדרות…',
          confirm: 'כן, אפס הכול והפעל מחדש',
          cancel: 'ביטול',
          hint: 'בחירת תמונה, טוקן, לוויינים מוצמדים, שפה והקטלוג שהורד — הכול.',
        },
      },
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Persists the choice across sessions (getStorage() falls back to an in-memory store when
// localStorage is unavailable — private browsing, quota, a sandboxed webview — so this never
// throws, it just doesn't survive a reload in that case).
i18n.on('languageChanged', (lng) => {
  if (isSupportedLanguage(lng)) getStorage().setItem(LANGUAGE_KEY, lng);
});

export default i18n;
