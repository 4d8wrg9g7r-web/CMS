"use client";

import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "framer-motion";

/**
 * The one page-level motion treatment (docs/design-system.md "Rules"): a
 * barely-there fade/rise on route change — 200ms, 6px — wrapped in
 * MotionConfig so prefers-reduced-motion users get none of it. Deliberately
 * not an exit animation: content must never feel delayed by choreography.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
