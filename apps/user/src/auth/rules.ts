// 계정 입력 규칙. packages/shared 의 같은 이름 상수와 값이 같아야 한다.
// (nest build 가 rootDir=src 밖의 TS 를 못 가져와서 여기 한 벌 더 둔다. 바꿀 때 둘 다 바꾼다.)

export const MAX_NICKNAME_LENGTH = 20;

/** 로그인 아이디. 공백을 뺀 출력 가능한 ASCII(영문·숫자·특수문자)만. 길이 상한은 없다. */
export const USERNAME_PATTERN = /^[\x21-\x7E]+$/;

/** 비밀번호. 아이디 규칙에 공백만 더 허용한다. */
export const PASSWORD_PATTERN = /^[\x20-\x7E]+$/;

/** bcrypt는 72바이트 이후를 무시하므로 그 앞에서 자른다. */
export const MAX_PASSWORD_LENGTH = 72;

/** 세션(JWT) 수명. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
