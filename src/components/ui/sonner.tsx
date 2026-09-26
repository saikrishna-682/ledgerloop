import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  // Colors come from the --normal-* CSS variables below, which resolve
  // against this app's own .dark class — Sonner's own light/dark/system
  // theming is unused, so no next-themes dependency is needed here.
  return (
    <Sonner
      theme="light"
      // Bottom (the default) sat right over the "Log it"/add-transaction
      // button, forcing you to wait for it to clear before logging another
      // transaction. Top-center, offset below the header (and the notch/
      // Dynamic Island via safe-area-inset-top), doesn't block anything.
      position="top-center"
      // Sonner uses `mobileOffset` (not `offset`) below its internal mobile
      // breakpoint — this app is phone-width at every screen size, so both
      // need the same value or the toast still lands under the header there.
      offset="max(16px, calc(env(safe-area-inset-top) + 64px))"
      mobileOffset="max(16px, calc(env(safe-area-inset-top) + 64px))"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
