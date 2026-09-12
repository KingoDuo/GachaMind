import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { HistoryModule } from "./history/history.module";
import { UserModule } from "./user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // forRootAsync: ConfigModule이 .env를 로드한 뒤 DATABASE_URL을 안전하게 주입.
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        autoLoadEntities: true,
        // 스키마는 마이그레이션(src/migrations)으로만 바꾼다. 기동 시 아직 안 적용된 것을 순서대로 적용하고
        // 이력은 public.migrations 에 남는다. synchronize 는 엔티티와 다른 컬럼을 예고 없이 지울 수 있어 쓰지 않는다.
        // nest build 가 src 전체를 dist 로 옮기므로 __dirname(dist) 아래 migrations/*.js 를 찾으면 된다.
        synchronize: false,
        migrations: [join(__dirname, "migrations", "*.js")],
        migrationsRun: true,
        // 같은 DB 에 user 태스크가 둘 떠도(롤링 배포) 마이그레이션은 한 트랜잭션 안에서 한 번만 돈다.
        migrationsTransactionMode: "all",
      }),
    }),
    UserModule,
    AuthModule,
    HistoryModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
