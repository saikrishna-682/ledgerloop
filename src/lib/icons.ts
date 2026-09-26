import {
  Banknote,
  Briefcase,
  Car,
  CircleDollarSign,
  CircleDot,
  Clapperboard,
  CreditCard,
  HeartPulse,
  Home,
  Landmark,
  PenTool,
  Plug,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Banknote,
  Briefcase,
  Car,
  CircleDollarSign,
  CircleDot,
  Clapperboard,
  CreditCard,
  HeartPulse,
  Home,
  Landmark,
  PenTool,
  Plug,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
};

export function iconByName(name: string): LucideIcon {
  return ICONS[name] ?? CircleDot;
}

export const ICON_CHOICES = Object.keys(ICONS);
