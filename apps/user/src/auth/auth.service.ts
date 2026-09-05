import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { User } from "../user/user.entity";
import { UserService } from "../user/user.service";

/** 브라우저에 노출되는 계정 정보. packages/shared 의 AuthUser 와 같은 모양. */
export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
}

/** packages/shared 의 AuthResponse 와 같은 모양. */
export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

/** JWT 본문. game-session 이 같은 시크릿으로 검증해 읽는다(packages/shared 의 SessionTokenPayload). */
export interface SessionTokenPayload {
  sub: string;
  username: string;
  nickname: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
  ) {}

  async signup(username: string, nickname: string, password: string): Promise<AuthResult> {
    if (await this.users.findByUsername(username)) {
      throw new ConflictException("이미 사용 중인 아이디입니다.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create(username, nickname.trim(), passwordHash);
    return this.issueToken(user);
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByUsername(username);
    // 아이디 존재 여부를 노출하지 않도록 동일한 메시지로 응답.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    return this.issueToken(user);
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const payload: SessionTokenPayload = {
      sub: user.id,
      username: user.username,
      nickname: user.nickname,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: { id: user.id, username: user.username, nickname: user.nickname },
    };
  }
}
