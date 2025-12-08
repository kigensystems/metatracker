import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24"
    >
      <Loader2 className="w-8 h-8 text-neon-green animate-spin mb-4" />
      <p className="text-ghost text-sm">Loading tokens...</p>
    </motion.div>
  );
}
