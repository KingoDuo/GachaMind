import { IsString, Length, Matches } from "class-validator";
import {
  MAX_NICKNAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_PATTERN,
  USERNAME_PATTERN,
} from "../rules";

export class SignupDto {
  @IsString()
  @Length(1, undefined, { message: "아이디를 입력하세요." })
  @Matches(USERNAME_PATTERN, { message: "아이디는 영문, 숫자, 특수문자만 쓸 수 있습니다." })
  username: string;

  @IsString()
  @Length(1, MAX_PASSWORD_LENGTH, {
    message: `비밀번호는 1~${MAX_PASSWORD_LENGTH}자여야 합니다.`,
  })
  @Matches(PASSWORD_PATTERN, { message: "비밀번호는 영문, 숫자, 특수문자만 쓸 수 있습니다." })
  password: string;

  @IsString()
  @Length(1, MAX_NICKNAME_LENGTH, {
    message: `닉네임은 1~${MAX_NICKNAME_LENGTH}자여야 합니다.`,
  })
  nickname: string;
}
