import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { GameFinishedDto } from "./dto/game-finished.dto";
import { HistoryService } from "./history.service";

/**
 * 서비스 간 전용 입구. results-worker 가 game.events 큐에서 받은 이벤트를 그대로 넘긴다.
 * 인증은 없다 — 이 서비스는 외부에 노출되지 않고 web/worker 만 부른다.
 * 응답 코드가 곧 ack 규칙이다: 200 = 처리됨(ack), 400 = 형식 불량(버림), 5xx = 나중에 다시(requeue).
 */
@Controller("internal")
export class InternalController {
  constructor(private readonly history: HistoryService) {}

  @Post("games")
  @HttpCode(200)
  async recordGame(@Body() event: GameFinishedDto): Promise<{ saved: boolean }> {
    const saved = await this.history.saveGameResult(event);
    return { saved };
  }
}
