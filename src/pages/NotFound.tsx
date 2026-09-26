import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex min-h-screen flex-col bg-muted/40"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center bg-background px-4 md:border-x md:border-border/60">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">404</h1>
          <p className="mt-2 text-base text-muted-foreground">Page not found</p>
        </div>
      </div>
    </motion.div>
  );
}
