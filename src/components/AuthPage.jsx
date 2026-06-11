import { useState } from 'react';
import { motion } from 'framer-motion';

export default function AuthPage({ onAuth }) {
  const [tab, setTab]   = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', pw: '' });
  const [err,  setErr]  = useState('');
  const [shake, setShake] = useState(false);

  const doShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const doSignIn = () => {
    if (!form.email || !form.pw) { setErr('Please fill in all fields'); doShake(); return; }
    const users = JSON.parse(localStorage.getItem('sf_users3') || '[]');
    const u = users.find(x => x.email === form.email && x.pw === form.pw);
    if (!u) { setErr('Wrong credentials — try signing up!'); doShake(); return; }
    setErr('');
    onAuth(u);
  };

  const doSignUp = () => {
    if (!form.name || !form.email || !form.pw) { setErr('Please fill in all fields'); doShake(); return; }
    if (form.pw.length < 6) { setErr('Password needs at least 6 characters'); doShake(); return; }
    const users = JSON.parse(localStorage.getItem('sf_users3') || '[]');
    if (users.find(x => x.email === form.email)) { setErr('Email already exists — sign in instead'); doShake(); return; }
    const u = { id: Date.now(), name: form.name, email: form.email, pw: form.pw };
    users.push(u);
    localStorage.setItem('sf_users3', JSON.stringify(users));
    setErr('');
    onAuth(u);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Background */}
      <motion.div
        initial={{ scale: 1.06 }}
        animate={{ scale: 1 }}
        transition={{ duration: 20, ease: 'linear' }}
        style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: `url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&q=80')`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'brightness(0.28) saturate(0.8)',
        }}
      />

      {/* Gradient overlays */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'linear-gradient(135deg, rgba(6,6,8,0.88) 0%, rgba(6,6,8,0.4) 50%, rgba(6,6,8,0.82) 100%)',
      }} />

      {/* Top logo */}
      <div style={{ position: 'relative', zIndex: 2, padding: '1.5rem 4%' }}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            fontFamily: 'var(--font-display)', fontSize: '2rem',
            color: 'var(--red)', letterSpacing: '5px',
          }}
        >
          STREAMFLIX
        </motion.div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { opacity: 1, scale: 1, y: 0 }}
          style={{
            background: 'rgba(6,6,8,0.88)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18,
            padding: '2.8rem 3rem',
            width: '100%', maxWidth: 440,
            backdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Tabs */}
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.05)',
            borderRadius: 10, padding: 4, marginBottom: '2rem',
          }}>
            {['signin', 'signup'].map(t => (
              <motion.div
                key={t}
                onClick={() => { setTab(t); setErr(''); }}
                animate={{ background: tab === t ? 'var(--red)' : 'transparent' }}
                whileHover={{ background: tab !== t ? 'rgba(255,255,255,0.05)' : undefined }}
                style={{
                  flex: 1, padding: '0.65rem', textAlign: 'center', cursor: 'pointer',
                  borderRadius: 7, fontSize: '0.88rem', fontWeight: 500,
                  color: tab === t ? '#fff' : 'var(--txt2)',
                  boxShadow: tab === t ? '0 2px 12px rgba(229,9,20,0.4)' : 'none',
                }}
              >
                {t === 'signin' ? 'Sign In' : 'Sign Up'}
              </motion.div>
            ))}
          </div>

          <motion.h2
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '2rem', fontWeight: 400,
              marginBottom: '1.8rem', letterSpacing: '-0.5px',
            }}
          >
            {tab === 'signin' ? 'Welcome back.' : 'Join ONEFLIX.'}
          </motion.h2>

          {/* Error */}
          {err && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(229,9,20,0.12)',
                border: '1px solid rgba(229,9,20,0.3)',
                borderRadius: 8, padding: '0.65rem 1rem',
                fontSize: '0.83rem', color: '#ff6b6b',
                marginBottom: '1rem',
              }}
            >
              ⚠️ {err}
            </motion.div>
          )}

          {/* Fields */}
          {tab === 'signup' && (
            <Field
              label="Your Name"
              type="text"
              value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Full name"
            />
          )}
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={v => setForm(f => ({ ...f, email: v }))}
            placeholder="Email address"
          />
          <Field
            label="Password"
            type="password"
            value={form.pw}
            onChange={v => setForm(f => ({ ...f, pw: v }))}
            placeholder={tab === 'signup' ? 'Min 6 characters' : 'Password'}
            onEnter={tab === 'signin' ? doSignIn : doSignUp}
          />

          <motion.button
            onClick={tab === 'signin' ? doSignIn : doSignUp}
            whileHover={{ background: '#ff2d3a', transform: 'translateY(-1px)', boxShadow: '0 8px 28px rgba(229,9,20,0.5)' }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%', padding: '1rem',
              background: 'var(--red)', border: 'none', borderRadius: 10,
              color: '#fff', fontSize: '0.95rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              marginTop: '0.5rem', letterSpacing: '0.4px',
              boxShadow: '0 4px 20px rgba(229,9,20,0.35)',
            }}
          >
            {tab === 'signin' ? 'Sign In' : 'Create Account →'}
          </motion.button>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--txt3)', fontSize: '0.85rem' }}>
            {tab === 'signin' ? 'New to ONEFLIX? ' : 'Already a member? '}
            <motion.span
              onClick={() => { setTab(tab === 'signin' ? 'signup' : 'signin'); setErr(''); }}
              whileHover={{ color: 'var(--red)' }}
              style={{ color: 'var(--txt)', cursor: 'pointer', fontWeight: 500 }}
            >
              {tab === 'signin' ? 'Start watching now.' : 'Sign in.'}
            </motion.span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, onEnter }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: '1rem' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '0.95rem 1.2rem',
          background: focused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${focused ? 'rgba(229,9,20,0.6)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 10, color: '#fff', fontSize: '0.95rem',
          fontFamily: 'var(--font-body)', outline: 'none',
          transition: 'all 0.25s ease',
          boxShadow: focused ? '0 0 0 3px rgba(229,9,20,0.12)' : 'none',
        }}
      />
    </div>
  );
}
