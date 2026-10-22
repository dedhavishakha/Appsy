import type { ReactNode } from "react";
import styles from "./public-page.module.css";

// Layout for Appsy's public pages (the front page, terms and privacy policy). They're plain
// web pages outside the Shopify admin, so they use no Polaris or App Bridge.

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brand}>
          Appsy
        </a>
        <span className={styles.by}>by Scopegen</span>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <nav className={styles.links} aria-label="Appsy">
          <a href="/terms">Terms and conditions</a>
          <a href="/privacy">Privacy policy</a>
          <a href="https://scopegen.in">Scopegen</a>
        </nav>
      </footer>
    </div>
  );
}

// Shown on legal pages until Scopegen's reviewed text replaces the draft.
export function DraftNotice() {
  return (
    <p className={styles.draft}>
      Draft for review. This text hasn&apos;t been approved yet and may change
      before Appsy launches. Text in [brackets] is still to be filled in.
    </p>
  );
}

// A legal document: title, date of this version, then its sections.
export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <PublicPage>
      <article className={styles.legal}>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated: {updated}</p>
        <DraftNotice />
        {children}
      </article>
    </PublicPage>
  );
}
