import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./user.entity";

// User 엔티티 접근을 한 곳에 캡슐화. auth 등 다른 모듈은 이 서비스만 쓴다.
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByUsername(username: string): Promise<User | null> {
    return this.users.findOne({ where: { username } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  create(username: string, nickname: string, passwordHash: string): Promise<User> {
    const user = this.users.create({ username, nickname, passwordHash });
    return this.users.save(user);
  }
}
