import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService, type AuthUser } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto.username, dto.nickname, dto.password);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  // Authorization: Bearer <token> 으로 내 정보 조회. web(BFF)이 세션 쿠키를 토큰으로 바꿔 부른다.
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: AuthUser }): AuthUser {
    return req.user;
  }
}
