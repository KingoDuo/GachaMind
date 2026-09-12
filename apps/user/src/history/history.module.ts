import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserModule } from "../user/user.module";
import { Game } from "./game.entity";
import { GamePlayer } from "./game-player.entity";
import { HistoryService } from "./history.service";
import { InternalController } from "./internal.controller";
import { ProfileController } from "./profile.controller";
import { UserStats } from "./user-stats.entity";

/** 전적 도메인: 저장(worker → 내부 API)과 조회(web → 프로필). */
@Module({
  imports: [TypeOrmModule.forFeature([Game, GamePlayer, UserStats]), UserModule],
  controllers: [InternalController, ProfileController],
  providers: [HistoryService],
})
export class HistoryModule {}
