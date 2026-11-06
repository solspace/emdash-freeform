/**
 * Field type icons — Phosphor, matching EmDash content-type “Add Field”
 * (`FieldEditor` FIELD_TYPES) where the type exists; Freeform-only types use
 * the same Phosphor regular weight for a consistent look.
 */
import type { Icon } from "@phosphor-icons/react";
import {
  Calendar,
  CalendarDots,
  CheckSquare,
  Checks,
  Code,
  Copy,
  EnvelopeSimple,
  EyeSlash,
  File,
  Hash,
  List,
  ListChecks,
  MagnifyingGlass,
  Phone,
  Plus,
  RadioButton,
  ShieldCheck,
  Star,
  TextAlignLeft,
  TextT,
  Textbox,
  Trash,
  X,
  PencilSimple,
} from "@phosphor-icons/react";
import type { FieldType } from "../types";

/** EmDash Add Field map (where overlapping) + Freeform-only types. */
const FIELD_ICONS: Record<FieldType, Icon> = {
  // EmDash: string → TextT, text → TextAlignLeft, number → Hash,
  // datetime → Calendar, select → List, multiSelect → ListChecks, file → File
  text: TextT,
  textarea: TextAlignLeft,
  number: Hash,
  date: Calendar,
  datetime: CalendarDots,
  select: List,
  multi_select: ListChecks,
  file: File,
  // Freeform-only — same Phosphor regular style
  email: EnvelopeSimple,
  phone: Phone,
  checkbox: CheckSquare,
  checkbox_group: Checks,
  radio: RadioButton,
  rating: Star,
  consent: ShieldCheck,
  hidden: EyeSlash,
  html: Code,
};

export function FieldIcon({
  type,
  className = "",
  size = 16,
}: {
  type: FieldType | string;
  className?: string;
  size?: number;
}) {
  const Icon = FIELD_ICONS[type as FieldType] ?? Textbox;
  return (
    <Icon
      size={size}
      weight="regular"
      className={className}
      aria-hidden
    />
  );
}

const ACTION_ICONS = {
  duplicate: Copy,
  delete: Trash,
  search: MagnifyingGlass,
  close: X,
  plus: Plus,
  check: CheckSquare,
  edit: PencilSimple,
  forms: Textbox,
} as const;

export function ActionIcon({
  name,
  className = "",
  size = 14,
}: {
  name: keyof typeof ACTION_ICONS;
  className?: string;
  size?: number;
}) {
  const Icon = ACTION_ICONS[name];
  return (
    <Icon
      size={size}
      weight="regular"
      className={className}
      aria-hidden
    />
  );
}
