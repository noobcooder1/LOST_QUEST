// Same public-address rules as SignupRequest: dotted domain, valid labels and unquoted local part.
const EMAIL = /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
export const EMAIL_MESSAGE = '아이디@gmail.com처럼 도메인과 확장자를 포함한 이메일 주소를 입력해 주세요.';
export function isValidSignupEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}
