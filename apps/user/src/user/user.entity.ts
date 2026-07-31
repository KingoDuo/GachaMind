import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

// user 서비스가 소유하는 유일한 영속 테이블(계정).
// TODO: 프로필/전적 관련 컬럼은 이후 슬라이스에서 확장.
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  nickname: string;

  // bcrypt 해시. 평문 비밀번호는 절대 저장하지 않는다.
  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
