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
        searchPlaceholder: 'Find a satellite by name or NORAD…',
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
        camera: 'Camera',
        cameraModes: { free: 'Free', track: 'Follow', nadir: 'Nadir' },
      },
      dock: {
        catalog: 'Catalog ({{count}})',
        satellite: 'Satellite',
        inclination: 'Inclination',
        sources: {
          none: 'Loading data…',
          fixture: 'Test data',
          snapshot: 'Bundled snapshot',
          cache: 'Cached data',
          celestrak: 'CelesTrak',
          mirror: 'TLE mirror',
        },
      },
      plan: {
        title: 'Imaging plan',
        opportunities: 'Opportunities ({{count}})',
        loading: 'Computing imaging opportunities…',
        disclaimer:
          'Asteria-1 is a fictional satellite invented for training. Its orbit, storage/downlink figures, and ground stations are simulated or assumed, not real telemetry from any ImageSat International satellite.',
        note: 'Build an imaging draft in time order. It stays while the app is open; execution and downlink planning are not connected yet.',
        offNadir: 'Off-nadir {{deg}}°',
        daylightYes: 'Day',
        daylightNo: 'Night',
        clean: 'Checks passed',
        findings: {
          IMG_ROLL_EXCEEDS_LIMIT: 'Roll limit exceeded',
          ELEMENTS_STALE: 'Older orbit data',
          STORAGE_INSUFFICIENT: 'Storage limit exceeded',
          IMG_OUTSIDE_WINDOW: 'Outside imaging window',
        },
        loadError: "Couldn't compute imaging opportunities: {{message}}",
        empty: 'No imaging opportunities found in the search window.',
        addToDraft: 'Add to plan',
        removeFromDraft: 'Remove',
        draftTitle: 'Draft plan',
        draftEmpty: 'Your draft is empty. Add an available imaging opportunity to see storage and validation here.',
        storageUsed: '{{used}} / {{total}} GB',
      },
      train: {
        title: 'Capture & downlink — Scenario 01',
        sessionHint:
          'A guided training run, separate from the Plan draft. Navigation pauses it; the run stays until restart or app close.',
        step: 'Next event',
        next: 'Next scheduled event',
        complete: 'Run complete',
        review: 'Review this run',
        restart: 'Restart…',
        confirmRestart: 'Discard run & restart',
        cancel: 'Cancel',
        disclaimer:
          'Asteria-1 is a fictional satellite invented for training. Its orbit, storage/downlink figures, and ground stations are simulated or assumed, not real telemetry from any ImageSat International satellite.',
        play: 'Play',
        pause: 'Pause',
        rate: 'Rate',
        storage: 'Storage',
        tasks: 'Tasks',
        noTasksYet: 'Ready to start. Press Play or Next event to reach the first capture.',
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
        title: 'Run debrief',
        backToTrain: 'Return to Train',
        note: 'Events recorded in your current training run. Return to Train to continue or restart.',
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
      explore: {
        controls: 'Explore time controls',
        now: 'Now',
        utc: 'Jump to UTC date and time',
        go: 'Go',
        home: 'Whole Earth',
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
        searchPlaceholder: 'חיפוש לוויין לפי שם או NORAD…',
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
        footprint: 'כיסוי',
        camera: 'מצלמה',
        cameraModes: { free: 'חופשי', track: 'מעקב', nadir: 'נדיר' },
      },
      dock: {
        catalog: 'קטלוג ({{count}})',
        satellite: 'לוויין',
        inclination: 'נטיית מסלול',
        sources: {
          none: 'טוען נתונים…',
          fixture: 'נתוני בדיקה',
          snapshot: 'נתונים מובנים',
          cache: 'נתונים מהמטמון',
          celestrak: 'CelesTrak',
          mirror: 'מראת TLE',
        },
      },
      plan: {
        title: 'תכנון צילום',
        opportunities: 'הזדמנויות ({{count}})',
        loading: 'מחשב הזדמנויות צילום…',
        disclaimer:
          'Asteria-1 הוא לוויין בדיוני שהומצא לצורכי אימון. המסלול, נתוני האחסון/הורדה ותחנות הקרקע שלו מדומים או מונחים, ואינם טלמטריה אמיתית מלוויין כלשהו של ImageSat International.',
        note: 'בנה טיוטת צילום לפי סדר הזמנים. היא נשמרת כל עוד האפליקציה פתוחה; ביצוע ותכנון הורדה עדיין לא מחוברים.',
        offNadir: 'סטייה מהנדיר {{deg}}°',
        daylightYes: 'יום',
        daylightNo: 'לילה',
        clean: 'הבדיקות עברו',
        findings: {
          IMG_ROLL_EXCEEDS_LIMIT: 'חריגה ממגבלת הטיה',
          ELEMENTS_STALE: 'נתוני מסלול ישנים',
          STORAGE_INSUFFICIENT: 'חריגה מנפח האחסון',
          IMG_OUTSIDE_WINDOW: 'מחוץ לחלון צילום',
        },
        loadError: 'חישוב הזדמנויות הצילום נכשל: {{message}}',
        empty: 'לא נמצאו הזדמנויות צילום בחלון החיפוש.',
        addToDraft: 'הוסף לתוכנית',
        removeFromDraft: 'הסר',
        draftTitle: 'טיוטת תוכנית',
        draftEmpty: 'הטיוטה ריקה. הוסף הזדמנות צילום זמינה כדי לראות כאן אחסון ותוצאות בדיקה.',
        storageUsed: '{{used}} / {{total}} GB',
      },
      train: {
        title: 'צילום והורדה — תרחיש 01',
        sessionHint:
          'אימון מודרך נפרד מטיוטת התכנון. מעבר מסך משהה אותו; ההרצה נשמרת עד התחלה מחדש או סגירת האפליקציה.',
        step: 'האירוע הבא',
        next: 'האירוע המתוזמן הבא',
        complete: 'ההרצה הושלמה',
        review: 'תחקור ההרצה',
        restart: 'התחל מחדש…',
        confirmRestart: 'מחק הרצה והתחל מחדש',
        cancel: 'ביטול',
        disclaimer:
          'Asteria-1 הוא לוויין בדיוני שהומצא לצורכי אימון. המסלול, נתוני האחסון/הורדה ותחנות הקרקע שלו מדומים או מונחים, ואינם טלמטריה אמיתית מלוויין כלשהו של ImageSat International.',
        play: 'הפעל',
        pause: 'השהה',
        rate: 'קצב',
        storage: 'אחסון',
        tasks: 'משימות',
        noTasksYet: 'מוכן להתחלה. לחץ הפעל או האירוע הבא כדי להגיע לצילום הראשון.',
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
        title: 'תחקיר ההרצה',
        backToTrain: 'חזרה לאימון',
        note: 'האירועים שנרשמו בהרצת האימון הנוכחית שלך. חזור לאימון כדי להמשיך או להתחיל מחדש.',
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
      explore: {
        controls: 'בקרות זמן לתצפית',
        now: 'עכשיו',
        utc: 'קפיצה לתאריך ושעה ב־UTC',
        go: 'עבור',
        home: 'כל כדור הארץ',
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
