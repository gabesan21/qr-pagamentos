import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/components/Footer";
import { Logo } from "@/components/Logo";

const accentStops = ["#00B8A0", "#2456E6", "#A85B1E", "#5EEAD4", "#4F8DFD", "#FFB224"];

/** Auth shell (design.md §6.3 / auth.md): texture bg, split card, brand panel, gradient strip. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-bg p-4"
      style={{ backgroundImage: "url(/auth-texture.svg)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-[720px] overflow-hidden rounded-card border border-border bg-surface shadow-modal"
      >
        {/* Ambient gradient strip cycling the six accents */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-1 origin-left"
          style={{ background: `linear-gradient(90deg, ${accentStops.join(", ")})` }}
          aria-hidden
        />
        <div className="flex min-h-[500px]">
          {/* Brand panel (hidden < 900px) */}
          <div className="hidden w-[300px] flex-col justify-between border-r border-border bg-surface-2 p-8 min-[900px]:flex">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.3 }}
            >
              <Logo />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.3 }}
              className="font-display text-lg font-semibold leading-7 text-text"
            >
              {t("app.tagline")}
              <span className="mt-1 block text-sm font-normal text-text-2">
                {t("app.name")} · {t("app.caption")}
              </span>
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.3 }}
              className="flex gap-1"
              aria-hidden
            >
              {accentStops.map((c) => (
                <span key={c} className="h-1.5 w-8 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </motion.div>
          </div>
          {/* Form panel */}
          <div className="relative flex-1 p-6 sm:p-8">
            <div className="absolute right-4 top-4">
              <LanguageSwitcher compact />
            </div>
            <div className="mx-auto max-w-auth pt-6">{children}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
