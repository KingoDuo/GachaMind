import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { User } from "./user/user.entity";

// TODO: AuthModule, ProfileModule 등을 여기에 추가.
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
        synchronize: true, // dev 편의(엔티티→테이블 자동반영). TODO: 프로덕션 전 마이그레이션으로 전환.
      }),
    }),
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [AppController],
})
export class AppModule {}
