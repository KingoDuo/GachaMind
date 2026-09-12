import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

// 계정 테이블. user DB 의 주인은 이 서비스라 스키마는 src/migrations 로만 바꾼다.
// 전적은 같은 서비스의 history 모듈(games / game_players / user_stats)에 있다.
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // 로그인 아이디. 계정을 구분하는 유일한 사람용 키.
  @Column({ unique: true })
  username: string;

  // 화면에 보이는 이름. 게스트도 아무 닉네임이나 쓸 수 있으므로 계정끼리만 unique 여도 중복을 못 막는다. 제약 없음.
  @Column()
  nickname: string;

  // bcrypt 해시. 평문 비밀번호는 절대 저장하지 않는다.
  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
