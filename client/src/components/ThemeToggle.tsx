import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
  { value: "system", label: "Auto", icon: <Monitor className="h-4 w-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Theme">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={theme === opt.value}
            onSelect={() => setTheme(opt.value)}
            className="gap-2"
          >
            {opt.icon}
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
