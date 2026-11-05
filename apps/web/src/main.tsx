import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { TutorAvailability } from './tutor-slots.js';

type User = { id: string; role: 'Customer' | 'Tutor' };
type TutorSessionPhase = 'active' | 'logout-pending' | 'logout-uncertain' | 'rechecking';

async function request(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('/api/v1/auth/' + path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.code ?? 'HTTP_' + response.status);
    }
    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A resumed Tutor must have a newly verified Session AND a fresh full
 * owner-only Slot GET before any of the private dashboard is rendered.
 */
async function verifyOwnList(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('/api/v1/tutor/slots', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.code ?? 'HTTP_' + response.status);
    }
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error('INVALID_SLOT_LIST');
  } finally {
    clearTimeout(timeout);
  }
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof Error &&
    (error.message === 'UNAUTHENTICATED' || error.message === 'HTTP_401');
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tutorPhase, setTutorPhase] = useState<TutorSessionPhase>('active');
  const version = useRef(0);
  const busyRef = useRef(false);
  const tutorActionsAllowed = useRef(true);
  // This ID is never rendered while Logout is pending or uncertain.
  const suspendedTutorId = useRef<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const guardHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    const current = ++version.current;
    request('me')
      .then(result => {
        if (active && version.current === current) {
          setUser(result.user as User);
          tutorActionsAllowed.current = true;
        }
      })
      .catch(() => {
        if (active && version.current === current) setUser(null);
      })
      .finally(() => {
        if (active && version.current === current) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tutorPhase !== 'active') guardHeadingRef.current?.focus();
  }, [tutorPhase]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    const current = ++version.current;
    setBusy(true);
    setError('');
    try {
      const result = await request('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (version.current === current) {
        suspendedTutorId.current = null;
        tutorActionsAllowed.current = true;
        setTutorPhase('active');
        setUser(result.user as User);
        setPassword('');
      }
    } catch (cause) {
      if (version.current === current) {
        setUser(null);
        setError(
          cause instanceof Error && cause.message === 'RATE_LIMITED'
            ? 'คำขอเข้าสู่ระบบมากเกินไป โปรดลองอีกครั้งภายหลัง'
            : cause instanceof Error && cause.name === 'AbortError'
              ? 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่'
              : 'ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูล',
        );
        queueMicrotask(() => emailRef.current?.focus());
      }
    } finally {
      busyRef.current = false;
      if (version.current === current) setBusy(false);
    }
  };

  const logout = async () => {
    if (busyRef.current) return;
    // Synchronous mutation guard: even a previously pending CSRF fetch
    // cannot initiate a new protected Slot POST after Logout starts.
    tutorActionsAllowed.current = false;
    busyRef.current = true;
    const current = ++version.current;
    const tutorLogout = user?.role === 'Tutor';
    if (tutorLogout) {
      suspendedTutorId.current = user.id;
      setTutorPhase('logout-pending'); // immediately unmounts all private Tutor content
    }
    setBusy(true);
    setError('');
    try {
      const { csrfToken } = await request('csrf');
      await request('logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (version.current === current) {
        suspendedTutorId.current = null;
        setUser(null);
        setTutorPhase('active');
      }
    } catch (cause) {
      if (version.current === current) {
        if (isUnauthenticated(cause)) {
          suspendedTutorId.current = null;
          setUser(null);
          setTutorPhase('active');
        } else {
          if (tutorLogout) setTutorPhase('logout-uncertain');
          setError('ไม่สามารถยืนยันการออกจากระบบได้ กรุณาลองอีกครั้งหรือตรวจสอบเซสชัน');
        }
      }
    } finally {
      busyRef.current = false;
      if (version.current === current) setBusy(false);
    }
  };

  const recheckSession = async () => {
    if (busyRef.current || tutorPhase !== 'logout-uncertain' || !suspendedTutorId.current) return;
    busyRef.current = true;
    const current = ++version.current;
    const expectedTutor = suspendedTutorId.current;
    setTutorPhase('rechecking');
    setBusy(true);
    setError('');
    try {
      const result = await request('me');
      const currentUser = result?.user as User | undefined;
      if (!currentUser || currentUser.role !== 'Tutor' || currentUser.id !== expectedTutor) {
        throw new Error('IDENTITY_CHANGED');
      }
      await verifyOwnList();
      if (version.current === current) {
        suspendedTutorId.current = null;
        tutorActionsAllowed.current = true;
        setUser(currentUser);
        setTutorPhase('active'); // fresh TutorAvailability remounts and does its own GET
        setError('');
      }
    } catch (cause) {
      if (version.current === current) {
        if (isUnauthenticated(cause)) {
          suspendedTutorId.current = null;
          setUser(null);
          setTutorPhase('active');
          setError('');
        } else {
          setTutorPhase('logout-uncertain');
          setError(
            cause instanceof Error && cause.message === 'IDENTITY_CHANGED'
              ? 'เซสชันเปลี่ยนบัญชีแล้ว ไม่สามารถเปิดข้อมูลของบัญชีเดิมได้ กรุณาลองออกจากระบบอีกครั้ง'
              : 'ยังตรวจสอบเซสชันและข้อมูลตารางเวลาไม่ได้ กรุณาลองใหม่',
          );
        }
      }
    } finally {
      busyRef.current = false;
      if (version.current === current) setBusy(false);
    }
  };

  const sessionExpired = () => {
    ++version.current;
    suspendedTutorId.current = null;
    tutorActionsAllowed.current = false;
    setUser(null);
    setTutorPhase('active');
    setLoading(false);
  };

  if (!loading && user?.role === 'Tutor') {
    if (tutorPhase !== 'active') {
      const pending = busy || tutorPhase === 'logout-pending' || tutorPhase === 'rechecking';
      return <main className="dashboard-root tutor-session-screen">
        <section className="tutor-session-guard" aria-labelledby="session-guard-heading">
          <p className="session-guard-brand">NutTiew</p>
          <h1 id="session-guard-heading" tabIndex={-1} ref={guardHeadingRef}>ตรวจสอบสถานะเซสชัน</h1>
          {pending && <p role="status">กำลังตรวจสอบคำขอและความปลอดภัยของเซสชัน…</p>}
          {!pending && <p role="alert">{error || 'ยังไม่สามารถยืนยันการออกจากระบบได้'}</p>}
          <p>ข้อมูลตารางเวลาและบัญชีถูกซ่อนไว้จนกว่าจะยืนยันตัวตนกับเซิร์ฟเวอร์อีกครั้ง</p>
          {!pending && <div className="session-guard-actions">
            <button type="button" onClick={() => void logout()} disabled={busy}>ลองออกจากระบบอีกครั้ง</button>
            <button type="button" onClick={() => void recheckSession()} disabled={busy}>ตรวจสอบเซสชัน</button>
          </div>}
        </section>
      </main>;
    }
    return <main className="dashboard-root">
      <TutorAvailability
        key={user.id}
        accountId={user.id}
        onLogout={logout}
        logoutBusy={busy}
        logoutError={error}
        canMutate={() => tutorActionsAllowed.current}
        onUnauthorized={sessionExpired}
      />
    </main>;
  }

  return <main><section className="panel">
    <p className="eyebrow">NutTiew · Authentication</p>
    <h1>ยินดีต้อนรับ</h1>
    <p className="subtitle">ระบบนัดหมายติวเตอร์สำหรับ Customer และ Tutor</p>
    {loading ? <p role="status">กำลังตรวจสอบเซสชัน…</p> : user ? <>
      <p className="success" role="status">เข้าสู่ระบบแล้ว</p>
      <p>บัญชี: <strong>{user.id.replaceAll('-', '').slice(-8)}</strong></p>
      <p>บทบาท: <strong>{user.role}</strong></p>
      <button onClick={logout} disabled={busy}>{busy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</button>
    </> : <form onSubmit={login} noValidate={false}>
      <label htmlFor="email">อีเมล</label>
      <input id="email" ref={emailRef} type="email" value={email}
        onChange={event => setEmail(event.target.value)}
        required autoComplete="email"
        aria-invalid={!!error} aria-describedby={error ? 'auth-error' : undefined} />
      <label htmlFor="password">รหัสผ่าน</label>
      <input id="password" type={visible ? 'text' : 'password'} value={password}
        onChange={event => setPassword(event.target.value)}
        required autoComplete="current-password"
        aria-invalid={!!error} aria-describedby={error ? 'auth-error' : undefined} />
      <button className="secondary" type="button" aria-pressed={visible}
        onClick={() => setVisible(value => !value)}>{visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</button>
      <button type="submit" disabled={busy}>{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
    </form>}
    {error && <p id="auth-error" role="alert" className="error">{error}</p>}
    <p className="footnote">ข้อมูลบัญชีแสดงจากเซิร์ฟเวอร์เท่านั้น</p>
  </section></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
