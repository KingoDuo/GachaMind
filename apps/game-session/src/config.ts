import { readFile } from "node:fs/promises";

/** 이 프로세스가 여는 WS 포트. 컨테이너 안에서만 의미가 있다. */
export const PORT = Number(process.env.PORT ?? 4001);

/**
 * 이 프로세스(샤드)의 이름과, 바깥에서 여기에 닿을 수 있는 주소.
 * Redis projection 에 기록해 matchmaking 이 어느 샤드에 방이 있는지 알고, gs-gateway 가 접속을 이어 주는 데 쓴다.
 *
 * 샤드는 미리 정해진 목록이 아니라 "지금 떠 있는 프로세스"다. 그래서 이름도 프로세스가 스스로 정한다:
 *   - ECS: 태스크 id(ECS 컨테이너 메타데이터 파일에서 읽는다). 주소는 인스턴스 사설 IP + Docker 가 고른 호스트 포트.
 *   - 로컬(pnpm dev/compose): 프록시가 없어 브라우저가 포트로 직접 붙어야 하므로 포트가 곧 이름이다(SHARD_ID 로 덮어쓸 수 있다).
 */
export interface ShardIdentity {
  shardId: string;
  host: string;
  port: number;
}

/** ECS 에이전트가 ECS_ENABLE_CONTAINER_METADATA=true 일 때 컨테이너에 넣어 주는 파일의 일부. */
interface EcsContainerMetadata {
  MetadataFileStatus?: "INITIAL" | "READY";
  TaskARN?: string;
  HostPrivateIPv4Address?: string;
  PortMappings?: { ContainerPort: number; HostPort: number; Protocol: string }[];
}

const METADATA_READY_ATTEMPTS = 20;
const METADATA_RETRY_MS = 500;

async function readEcsMetadata(path: string): Promise<EcsContainerMetadata> {
  // 컨테이너가 뜬 직후엔 파일이 아직 INITIAL 일 수 있다(호스트 포트가 채워지기 전). READY 까지 잠깐 기다린다.
  for (let attempt = 0; attempt < METADATA_READY_ATTEMPTS; attempt += 1) {
    const meta = JSON.parse(await readFile(path, "utf8")) as EcsContainerMetadata;
    if (meta.MetadataFileStatus === "READY") return meta;
    await new Promise((resolve) => setTimeout(resolve, METADATA_RETRY_MS));
  }
  throw new Error(`ECS container metadata at ${path} never became READY`);
}

export async function resolveShardIdentity(): Promise<ShardIdentity> {
  const metadataFile = process.env.ECS_CONTAINER_METADATA_FILE;
  if (!metadataFile) {
    return {
      shardId: process.env.SHARD_ID ?? String(PORT),
      host: process.env.ADVERTISE_HOST ?? "127.0.0.1",
      port: Number(process.env.ADVERTISE_PORT ?? PORT),
    };
  }

  const meta = await readEcsMetadata(metadataFile);
  const taskId = meta.TaskARN?.split("/").pop();
  const mapping = meta.PortMappings?.find((m) => m.ContainerPort === PORT && m.Protocol === "tcp");
  if (!taskId || !meta.HostPrivateIPv4Address || !mapping) {
    throw new Error(`ECS container metadata is missing task id, host ip or the port mapping for ${PORT}`);
  }
  return { shardId: process.env.SHARD_ID ?? taskId, host: meta.HostPrivateIPv4Address, port: mapping.HostPort };
}
