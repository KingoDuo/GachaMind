import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port, "0.0.0.0");
  console.log(`[user] listening on ${port}`);
}

bootstrap();
