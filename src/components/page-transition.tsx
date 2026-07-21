'use client';

import { motion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease }}
    >
      {children}
    </motion.div>
  );
}
