import { motion } from "framer-motion";
import { WHATSAPP_LP_HREF } from "@/lib/whatsapp";

export default function WhatsAppFab() {
  return (
    <motion.a
      href={WHATSAPP_LP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 1, type: "spring", stiffness: 200, damping: 18 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-2xl shadow-emerald-500/40 ring-4 ring-emerald-500/20"
      style={{ backgroundColor: "#25D366" }}
    >
      <span className="absolute inset-0 rounded-full animate-ping bg-emerald-500/30" aria-hidden />
      <svg
        viewBox="0 0 32 32"
        className="w-7 h-7 relative"
        fill="white"
        aria-hidden
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.13-.33.244-.703.244-1.06 0-.488-1.388-.778-1.473-.808-.31-.115-.616-.215-.918-.215zM16.045 26.5c-2.448 0-4.74-.717-6.66-2.064l-4.654 1.49 1.518-4.482a11.93 11.93 0 0 1-2.296-7.05c0-6.605 5.387-11.99 12.092-11.99 6.704 0 12.092 5.385 12.092 11.99 0 6.604-5.388 12.106-12.092 12.106zm0-26.5C8.225 0 1.846 6.378 1.846 14.193c0 2.65.732 5.215 2.122 7.435L0 32l10.59-3.382a14.42 14.42 0 0 0 5.455 1.064C23.866 29.682 30.245 23.305 30.245 15.49 30.245 7.677 23.866 1.3 16.045 1.3" fillRule="evenodd"/>
      </svg>
    </motion.a>
  );
}
