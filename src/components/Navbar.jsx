import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '../utils/data';
import OneflixLogo from './OneflixLogo';
import ProfileAvatar from './ProfileAvatar';
import { useMediaQuery } from '../utils/useMedia';

export default function Navbar({ active, onNavigate, onSearch }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  const go = (id) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  const openSearch = () => {
    setMenuOpen(false);
    onSearch();
  };

  const navLink = (item) => {
    if (item.href) {
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="nav-link"
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </a>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        className={`nav-link${active === item.id ? ' active' : ''}`}
        onClick={() => go(item.id)}
        aria-current={active === item.id ? 'page' : undefined}
      >
        {item.label}
      </button>
    );
  };

  return (
    <>
      <header className={`nav-bar${scrolled || menuOpen ? ' nav-bar--solid' : ''}`}>
        <div className="nav-bar-inner">
          <button type="button" className="nav-logo" onClick={() => go('home')}>
            <OneflixLogo />
          </button>

          <nav className="nav-links nav-links--desktop" aria-label="Main navigation">
            {NAV_ITEMS.map(navLink)}
          </nav>

          <div className="nav-actions">
            <button type="button" className="nav-action-btn" onClick={openSearch} aria-label="Search">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button type="button" className="nav-action-btn nav-action-btn--desktop" aria-label="Notifications">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <button type="button" className="nav-profile" aria-label="Profile">
              <ProfileAvatar />
              <svg className="nav-profile-chevron" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            <button
              type="button"
              className={`nav-menu-btn${menuOpen ? ' open' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`nav-mobile-backdrop${menuOpen ? ' visible' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <nav
        className={`nav-mobile-menu${menuOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        {NAV_ITEMS.map(navLink)}
      </nav>
    </>
  );
}
