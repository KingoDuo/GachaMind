import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthUser, SessionTokenPayload } from "./auth.service";

// Authorization: Bearer <token> 헤더에서 JWT를 꺼내 검증한다.
// game-session 도 같은 JWT_SECRET 으로 토큰을 로컬 검증한다(WS 핸드셰이크의 세션 쿠키).
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret",
    });
  }

  // 반환값이 req.user에 담긴다. 브라우저에 그대로 내려가는 모양(AuthUser)으로 맞춘다.
  validate(payload: SessionTokenPayload): AuthUser {
    return { id: payload.sub, username: payload.username, nickname: payload.nickname };
  }
}
