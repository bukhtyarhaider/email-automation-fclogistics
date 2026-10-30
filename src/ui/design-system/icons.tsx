import type { LucideIcon, LucideProps } from 'lucide-react';
import { cx } from '../shared/utils';

/** Curated named exports keep feature imports consistent and production bundles tree-shakable. */
export {
  Activity,
  ArrowRight,
  Ban,
  CalendarDays,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleCheckBig,
  CircleDot,
  CircleHelp,
  CircleX,
  Clock,
  CodeXml,
  Copy,
  Download,
  Eye,
  FileInput,
  FileText,
  Fingerprint,
  Folder,
  Info,
  Inbox,
  Sprout,
  Mailbox,
  Zap,
  Lightbulb,
  KeyRound,
  Layers,
  LayoutGrid,
  Mail,
  MailOpen,
  MessagesSquare,
  Monitor,
  NotebookText,
  PanelsTopLeft,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Square,
  SquareCheckBig,
  SquarePen,
  Star,
  TableProperties,
  Target,
  Terminal,
  Timer,
  Trash2,
  TriangleAlert,
  Truck,
  Upload,
  UserRound,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
export type { LucideIcon } from 'lucide-react';

export type IconProps = Omit<LucideProps, 'children'> & {
  icon: LucideIcon;
};

/** Label the surrounding control; decorative icons stay out of its accessible name. */
export function Icon({ icon: Component, size = 16, className, ...props }: IconProps) {
  return (
    <Component
      size={size}
      strokeWidth={2}
      focusable="false"
      className={cx('ui-icon', className)}
      {...props}
    />
  );
}
