import { useEffect } from 'react';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found | Industrialist Calculator';

    return () => {
      document.title = 'Industrialist Calculator';
    };
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="not-found-title">
        <div className={styles.code}>404</div>
        <h1 id="not-found-title">Page not found</h1>
        <p>That address doesn’t exist.</p>
        <a className={styles.homeLink} href="/">
          Return to calculator
        </a>
      </section>
    </main>
  );
}
