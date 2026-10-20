import { ApiClientError, apiRequest, type ApiRequestOptions } from './apiClient';
import { clearAuthSession, loadAuthSession } from './authSession';
import { EMAIL_MESSAGE, isValidSignupEmail } from './emailValidation';

export type UserRole = 'USER' | 'ADMIN';

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface SignupInput {
  email: string;
  password: string;
  nickname: string;
}

type RequestConfig = Pick<ApiRequestOptions, 'baseUrl' | 'timeoutMs'>;

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '예상한 인증 응답이 아니에요. 서버 주소를 확인해 주세요.');

function parseAuthUser(value: unknown): AuthUser {
  if (!value || typeof value !== 'object') throw invalidResponse();
  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || typeof user.email !== 'string' ||
      typeof user.nickname !== 'string' || (user.role !== 'USER' && user.role !== 'ADMIN')) throw invalidResponse();
  // Whitelist fields so nothing unexpected (e.g. a password hash) is kept in app state.
  return { id: user.id, email: user.email, nickname: user.nickname, role: user.role };
}

export async function signup(input: SignupInput, config: RequestConfig = {}): Promise<AuthUser> {
  if (!isValidSignupEmail(input.email)) throw new ApiClientError('INVALID_INPUT', EMAIL_MESSAGE);
  const body = { email: input.email.trim(), password: input.password, nickname: input.nickname.trim() };
  return parseAuthUser(await apiRequest('/api/auth/signup', { ...config, method: 'POST', body }));
}

export async function login(email: string, password: string, config: RequestConfig = {}): Promise<LoginResult> {
  const value = await apiRequest('/api/auth/login', { ...config, method: 'POST', body: { email: email.trim(), password } });
  if (!value || typeof value !== 'object') throw invalidResponse();
  const result = value as Record<string, unknown>;
  if (typeof result.accessToken !== 'string' || !result.accessToken || result.tokenType !== 'Bearer' ||
      typeof result.expiresIn !== 'number' || !(result.expiresIn > 0)) throw invalidResponse();
  return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: parseAuthUser(result.user) };
}

export const MAX_NICKNAME_LENGTH = 20;
function sessionToken(): string {
  const session = loadAuthSession();
  if (!session) throw new ApiClientError('HTTP_ERROR', '로그인 후 이용해 주세요.', 401);
  return session.accessToken;
}

/** Posts and comments show the current nickname, so the change appears everywhere at once. */
export async function updateNickname(nickname: string, config: RequestConfig = {}): Promise<AuthUser> {
  const value = nickname.trim();
  if (!value || value.length > MAX_NICKNAME_LENGTH) throw new ApiClientError('INVALID_INPUT', `닉네임은 1~${MAX_NICKNAME_LENGTH}자로 입력해 주세요.`);
  return parseAuthUser(await apiRequest('/api/auth/me/nickname', { ...config, accessToken: sessionToken(), method: 'PUT', body: { nickname: value } }));
}

export async function changePassword(currentPassword: string, newPassword: string, config: RequestConfig = {}): Promise<void> {
  if (!currentPassword) throw new ApiClientError('INVALID_INPUT', '현재 비밀번호를 입력해 주세요.');
  if (newPassword.length < 8 || newPassword.length > 64) throw new ApiClientError('INVALID_INPUT', '새 비밀번호는 8~64자로 입력해 주세요.');
  await apiRequest('/api/auth/me/password', { ...config, accessToken: sessionToken(), method: 'PUT', body: { currentPassword, newPassword } });
}

export async function fetchCurrentUser(accessToken: string, config: RequestConfig = {}): Promise<AuthUser> {
  return parseAuthUser(await apiRequest('/api/auth/me', { ...config, accessToken }));
}

/**
 * Verifies a stored token with the server. A rejected token (401) is removed; a temporary
 * network failure keeps it so the next reload can retry, but the user is not treated as signed in.
 */
export async function restoreAuthSession(
  loadSession = loadAuthSession,
  fetchUser = fetchCurrentUser,
  clearSession = clearAuthSession,
): Promise<{ user: AuthUser; expiresAt: number } | null> {
  const session = loadSession();
  if (!session) return null;
  try {
    return { user: await fetchUser(session.accessToken), expiresAt: session.expiresAt };
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 401 || error.status === 403 || error.code === 'INVALID_RESPONSE')) clearSession();
    return null;
  }
}

/** Korean message for the auth form. Field messages come from server validation when present. */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error.serverCode === 'VALIDATION_ERROR' && error.fieldErrors.length > 0) {
    const labels: Record<string, string> = { email: '이메일', password: '비밀번호', nickname: '닉네임', passwordWithinBcryptLimit: '비밀번호',
      currentPassword: '현재 비밀번호', newPassword: '새 비밀번호', newPasswordWithinBcryptLimit: '새 비밀번호' };
    return error.fieldErrors.map(({ field, message }) => `${labels[field] ?? field}: ${message}`).join('\n');
  }
  return error.message;
}
