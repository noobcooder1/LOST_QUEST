import { useEffect, useRef, useState } from 'react';
import { getGoogleClientId, loadGoogleIdentity } from '../services/googleIdentity';
import './GoogleSignInButton.css';

interface GoogleSignInButtonProps {
  mode: 'signin' | 'signup';
  /** Blocks clicks while another sign-in request is running. */
  disabled?: boolean;
  /**
   * `default` keeps the older divider + GIS button. `entry` is a full-width stacked
   * login path with a custom face and an invisible GIS overlay that still runs OAuth.
   */
  variant?: 'default' | 'entry';
  onCredential: (credential: string) => void;
}

function GoogleMark() {
  return (
    <svg className="auth-entry-google-mark" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Google's own sign-in button, drawn by GIS in a popup flow. Default variant renders nothing when no client id is configured. */
export default function GoogleSignInButton({ mode, disabled = false, variant = 'default', onCredential }: GoogleSignInButtonProps) {
  const clientId = getGoogleClientId();
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => { callback.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setFailed(false);
    loadGoogleIdentity().then(api => {
      const element = slot.current;
      if (cancelled || !element) return;
      api.initialize({
        client_id: clientId,
        callback: response => { if (response.credential) callback.current(response.credential); },
        ux_mode: 'popup',
        auto_select: false,
        context: mode,
      });
      element.replaceChildren();
      api.renderButton(element, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: variant === 'entry' ? 'rectangular' : 'pill',
        logo_alignment: variant === 'entry' ? 'left' : 'center',
        locale: 'ko',
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        // GIS accepts 200-400px and does not follow the container afterwards.
        width: Math.min(400, Math.max(200, Math.round(element.clientWidth || (variant === 'entry' ? 360 : 320)))),
      });
    }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId, mode, variant]);

  // No VITE_GOOGLE_CLIENT_ID in this build → hide Google entirely (do not show a "설정 필요" stub).
  if (!clientId) return null;

  if (variant === 'entry') {
    return (
      <div className={`auth-entry-google-wrap${disabled ? ' is-disabled' : ''}`}>
        <div className="auth-entry-btn auth-entry-google" aria-hidden="true">
          <GoogleMark />
          <span>Google로 시작하기</span>
        </div>
        <div ref={slot} className="google-signin-slot google-signin-overlay" aria-disabled={disabled || undefined} />
        {failed && <p className="field-error" role="status">구글 로그인 버튼을 불러오지 못했어요. 네트워크를 확인한 뒤 새로고침해 주세요.</p>}
      </div>
    );
  }

  return <div className="google-signin">
    <div className="google-signin-divider"><span>또는</span></div>
    <div ref={slot} className={`google-signin-slot${disabled ? ' is-disabled' : ''}`} aria-disabled={disabled || undefined} />
    {failed && <p className="field-error" role="status">구글 로그인 버튼을 불러오지 못했어요. 네트워크를 확인한 뒤 새로고침해 주세요.</p>}
    <p className="muted google-signin-note">구글로 처음 시작하면 구글 계정의 이메일과 이름이 닉네임으로 저장돼요.</p>
  </div>;
}
