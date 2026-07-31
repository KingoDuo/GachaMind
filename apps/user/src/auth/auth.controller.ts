import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto.nickname, dto.password);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.nickname, dto.password);
  }

  // 토큰 검증 데모: Authorization: Bearer <token> 로 내 정보 조회.
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: { userId: string; nickname: string } }) {
    return req.user;
  }
}
