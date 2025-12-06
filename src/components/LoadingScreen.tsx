import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <div className="py-12">
      {/* Loading indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center mb-8"
      >
        <div className="relative w-16 h-16 mb-4">
          {/* Outer ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-steel border-t-neon-green"
          />
          {/* Inner ring */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-2 rounded-full border-2 border-steel border-b-neon-blue"
          />
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-neon-green"
            />
          </div>
        </div>
        <p className="text-ghost text-sm">Fetching graduated tokens...</p>
        <p className="text-muted text-xs mt-1">Analyzing security metrics</p>
      </motion.div>

      {/* Skeleton cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-abyss/80 border border-steel/50 rounded-xl p-5"
          >
            <div className="flex items-start gap-4">
              {/* Image skeleton */}
              <div className="w-16 h-16 rounded-xl skeleton" />

              <div className="flex-1">
                {/* Title skeleton */}
                <div className="h-5 w-32 rounded skeleton mb-2" />
                <div className="h-4 w-20 rounded skeleton mb-4" />

                {/* Stats skeleton */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="h-3 w-12 rounded skeleton mb-1" />
                    <div className="h-4 w-16 rounded skeleton" />
                  </div>
                  <div>
                    <div className="h-3 w-12 rounded skeleton mb-1" />
                    <div className="h-4 w-16 rounded skeleton" />
                  </div>
                  <div>
                    <div className="h-3 w-12 rounded skeleton mb-1" />
                    <div className="h-4 w-16 rounded skeleton" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
