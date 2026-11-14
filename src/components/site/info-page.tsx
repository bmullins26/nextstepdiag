import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteFooter } from "./site-footer";

/** Simple layout for public text pages (About/Terms/Privacy/Contact). */
export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border"><div className="mx-auto flex h-14 max-w-3xl items-center px-4"><Link to="/" className="font-black tracking-tight">NextStep Diagnostics</Link></div></header>
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-black tracking-tight text-foreground">{title}</h1>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}
