import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

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
      placeholder: {
        plan: 'Plan workspace lands with the operator-simulation vertical slice (Scenario 01).',
        train: 'Train console lands with the operator-simulation vertical slice (Scenario 01).',
      },
      globe: {
        starting: 'Starting the 3D globe…',
        error: 'The 3D globe could not start: {{message}}',
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
      placeholder: {
        plan: 'סביבת התכנון תופעל עם פרוסת סימולציית המפעיל (תרחיש 01).',
        train: 'מסוף האימון יופעל עם פרוסת סימולציית המפעיל (תרחיש 01).',
      },
      globe: {
        starting: 'מפעיל את הגלובוס…',
        error: 'הפעלת הגלובוס נכשלה: {{message}}',
      },
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
