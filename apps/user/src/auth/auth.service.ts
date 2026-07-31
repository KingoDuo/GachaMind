import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserService } from "../user/user.service";

export interface AuthResult {
  accessToken: string;
  user: { id: string; nickname: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
  ) {}

  async signup(nickname: string, password: string): Promise<AuthResult> {
    if (await this.users.findByNickname(nickname)) {
      throw new ConflictException("이미 사용 중인 닉네임입니다.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create(nickname, passwordHash);
    return this.issueToken(user.id, user.nickname);
  }

  async login(nickname: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByNickname(nickname);
    // 닉네임 존재 여부를 노출하지 않도록 동일한 메시지로 응답.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("닉네임 또는 비밀번호가 올바르지 않습니다.");
    }
    return this.issueToken(user.id, user.nickname);
  }

  private async issueToken(id: string, nickname: string): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({ sub: id, nickname });
    return { accessToken, user: { id, nickname } };
  }
}
