export default function ProfileAvatar({ size = 32 }) {
  return (
    <span className="nav-avatar" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="profile-avatar-grad" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e50914" />
            <stop offset="1" stopColor="#831010" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="4" fill="url(#profile-avatar-grad)" />
        <circle cx="11.5" cy="13" r="2.5" fill="#fff" />
        <circle cx="20.5" cy="13" r="2.5" fill="#fff" />
        <path
          d="M10.5 20.5C12.5 23 19.5 23 21.5 20.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
