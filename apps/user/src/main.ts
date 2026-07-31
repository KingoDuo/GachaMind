import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // DTO 검증 전역 적용: whitelist(정의 안 된 필드 제거) + transform(타입 변환).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port, "0.0.0.0");
  console.log(`[user] listening on ${port}`);
}

bootstrap();
