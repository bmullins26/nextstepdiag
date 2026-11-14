import { Link } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

/** Shared public footer (home, partner pages, legal pages). */
export function SiteFooter() {
  return (
    <footer className="relative border-t border-border py-8 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
        <span className="inline-flex items-center gap-2"><Wrench className="h-3.5 w-3.5 text-primary" /> Built for the field, not the office.</span>
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link to="/about" className="hover:text-foreground">About</Link>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}
