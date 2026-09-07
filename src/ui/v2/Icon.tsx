import type { SVGProps } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Search,
  Settings2,
  Radio,
  Camera,
  Satellite,
  AlertTriangle,
  CheckCircle2,
  Circle,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Globe2,
  Wifi,
  Battery,
  HardDrive,
  Command,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated subset of lucide-react icons SatLoc actually uses, referenced by a stable internal
 * name rather than importing lucide icons ad hoc at each call site. Keeps the icon set
 * auditable in one place, keeps the bundle from growing silently as new icons get imported
 * here and there, and gives a single place to swap the underlying icon library later without
 * touching every call site.
 */
const REGISTRY = {
  'chevron-forward': ChevronRight,
  'chevron-expand': ChevronDown,
  search: Search,
  settings: Settings2,
  radio: Radio,
  camera: Camera,
  satellite: Satellite,
  warning: AlertTriangle,
  check: CheckCircle2,
  dot: Circle,
  close: X,
  play: Play,
  pause: Pause,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  clock: Clock,
  globe: Globe2,
  link: Wifi,
  battery: Battery,
  storage: HardDrive,
  command: Command,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  name: IconName;
  size?: number;
  /**
   * True for icons whose meaning is direction-of-motion (e.g. "forward", "expand towards the
   * reading end") — these mirror under `dir="rtl"` (see `.sl-icon--directional` in tokens.css).
   * False (the default) for icons whose meaning doesn't depend on reading direction, like a
   * clock, a globe, or a satellite — those must never mirror.
   */
  directional?: boolean;
}

/** Internal wrapper around lucide-react — see `REGISTRY` for the curated icon set. */
export function Icon({ name, size = 16, directional = false, className, ...rest }: IconProps) {
  const Glyph = REGISTRY[name];
  const classes = ['sl-icon', directional ? 'sl-icon--directional' : '', className].filter(Boolean).join(' ');
  return <Glyph size={size} className={classes} aria-hidden="true" {...rest} />;
}
