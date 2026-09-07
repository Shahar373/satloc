/**
 * Bundled fonts for Shell V2 — imported as a module side effect so Vite inlines the @font-face
 * rules and font files into the build (no network fetch, works fully offline, unlike a Google
 * Fonts <link>). All three are SIL Open Font License 1.1, which explicitly permits embedding in
 * and redistributing with software: https://openfontlicense.org/open-font-license-official-text/
 *
 * - Inter (Latin UI text) — @fontsource/inter
 * - Noto Sans Hebrew (Hebrew UI text) — @fontsource/noto-sans-hebrew
 * - JetBrains Mono (data/telemetry values) — @fontsource/jetbrains-mono
 *
 * Only the weights Shell V2 actually uses are imported, to keep the bundle small. Import this
 * module once, near the app's entry point, before Shell V2 mounts.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import '@fontsource/noto-sans-hebrew/400.css';
import '@fontsource/noto-sans-hebrew/500.css';
import '@fontsource/noto-sans-hebrew/600.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
