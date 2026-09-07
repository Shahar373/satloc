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
