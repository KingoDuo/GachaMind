import { IsString, Length } from "class-validator";

export class SignupDto {
  @IsString()
  @Length(2, 20, { message: "닉네임은 2~20자여야 합니다." })
  nickname: string;

  @IsString()
  @Length(8, 72, { message: "비밀번호는 8~72자여야 합니다." }) // bcrypt는 72바이트까지만 반영
  password: string;
}
