import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '../utils/data';
import OneflixLogo from './OneflixLogo';

export default function Navbar({ active, onNavigate, onSearch }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`nav-bar${scrolled ? ' nav-bar--solid' : ''}`}>
      <div className="nav-bar-inner">
        <button type="button" className="nav-logo" onClick={() => onNavigate('home')}>
          <OneflixLogo />
        </button>

        <nav className="nav-links" aria-label="Main navigation">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.id}
                type="button"
                className={`nav-link${active === item.id ? ' active' : ''}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            )
          )}
        </nav>

        <div className="nav-actions">
          <button type="button" className="nav-action-btn" onClick={onSearch} aria-label="Search">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <button type="button" className="nav-action-btn" aria-label="Notifications">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <button type="button" className="nav-profile" aria-label="Profile">
            <span className="nav-avatar" />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
