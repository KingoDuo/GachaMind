import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

// user 서비스가 소유하는 유일한 영속 테이블.
// TODO: 실제 컬럼(계정/자격증명/프로필/전적) 확정. 지금은 뼈대만.
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  nickname: string;

  @CreateDateColumn()
  createdAt: Date;
}
