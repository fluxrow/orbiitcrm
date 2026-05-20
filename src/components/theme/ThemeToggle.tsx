import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNextOrbitTheme, normalizeOrbitTheme } from "@/lib/theme";

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const activeTheme = normalizeOrbitTheme(theme);
  const nextTheme = getNextOrbitTheme(theme);
  const isDark = activeTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "sm"}
      className={cn(
        compact ? "h-9 w-9" : "w-full justify-start gap-2 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => setTheme(nextTheme)}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{isDark ? "Tema claro" : "Tema escuro"}</span>}
    </Button>
  );
}
