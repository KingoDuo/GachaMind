import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface JwtPayload {
  sub: string;
  nickname: string;
}

// Authorization: Bearer <token> 헤더에서 JWT를 꺼내 검증한다.
// game-session 등 다른 서비스도 같은 JWT_SECRET으로 토큰을 로컬 검증할 수 있다(신원 브릿지).
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret",
    });
  }

  // 반환값이 req.user에 담긴다.
  validate(payload: JwtPayload) {
    return { userId: payload.sub, nickname: payload.nickname };
  }
}
