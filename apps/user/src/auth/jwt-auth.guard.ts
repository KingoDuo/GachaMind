import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

// @UseGuards(JwtAuthGuard) 로 라우트를 보호한다. JwtStrategy("jwt")를 실행.
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
