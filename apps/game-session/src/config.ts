import { readFile } from "node:fs/promises";

/** 이 프로세스가 여는 WS 포트. 컨테이너 안에서만 의미가 있다. */
export const PORT = Number(process.env.PORT ?? 4001);

/**
 * 이 프로세스(샤드)의 이름과, 바깥에서 여기에 닿을 수 있는 주소.
 * Redis projection 에 기록해 matchmaking 이 어느 샤드에 방이 있는지 알고, gs-gateway 가 접속을 이어 주는 데 쓴다.
 *
 * 샤드는 미리 정해진 목록이 아니라 "지금 떠 있는 프로세스"다. 그래서 이름도 프로세스가 스스로 정한다:
 *   - ECS: 태스크 id 와 호스트 포트는 태스크 메타데이터 엔드포인트(v4)에서, 인스턴스 사설 IP 는 컨테이너 메타데이터 파일에서 읽는다.
 *   - 로컬(pnpm dev/compose): 프록시가 없어 브라우저가 포트로 직접 붙어야 하므로 포트가 곧 이름이다(SHARD_ID 로 덮어쓸 수 있다).
 */
export interface ShardIdentity {
  shardId: string;
  host: string;
  port: number;
}

/** ECS 에이전트가 ECS_ENABLE_CONTAINER_METADATA=true 일 때 컨테이너에 넣어 주는 파일의 일부. 인스턴스 사설 IP 를 여기서 읽는다. */
interface EcsContainerMetadataFile {
  MetadataFileStatus?: "INITIAL" | "READY";
  HostPrivateIPv4Address?: string;
}

/**
 * 태스크 메타데이터 엔드포인트 v4(ECS_CONTAINER_METADATA_URI_V4)/task 응답의 일부. 태스크 id 와 호스트 포트를 여기서 읽는다.
 * Service Connect 가 붙은 bridge 태스크는 포트 매핑이 앱 컨테이너가 아니라 ECS 의 pause 컨테이너에 걸려서
 * 메타데이터 파일의 PortMappings 가 비어 있다. 이 엔드포인트는 앱 컨테이너 항목에도 HostPort 를 채워 준다.
 */
interface EcsTaskMetadata {
  TaskARN?: string;
  Containers?: { Name?: string; Ports?: { ContainerPort: number; HostPort?: number; Protocol?: string }[] }[];
}

const METADATA_READY_ATTEMPTS = 20;
const METADATA_RETRY_MS = 500;

async function readMetadataFile(path: string): Promise<EcsContainerMetadataFile> {
  // 컨테이너가 뜬 직후엔 파일이 아직 INITIAL 일 수 있다. READY 까지 잠깐 기다린다.
  for (let attempt = 0; attempt < METADATA_READY_ATTEMPTS; attempt += 1) {
    const meta = JSON.parse(await readFile(path, "utf8")) as EcsContainerMetadataFile;
    if (meta.MetadataFileStatus === "READY") return meta;
    await new Promise((resolve) => setTimeout(resolve, METADATA_RETRY_MS));
  }
  throw new Error(`ECS container metadata at ${path} never became READY`);
}

async function readTaskMetadata(uri: string): Promise<EcsTaskMetadata> {
  const res = await fetch(`${uri}/task`);
  if (!res.ok) throw new Error(`task metadata endpoint returned ${res.status}`);
  return (await res.json()) as EcsTaskMetadata;
}

export async function resolveShardIdentity(): Promise<ShardIdentity> {
  const metadataFile = process.env.ECS_CONTAINER_METADATA_FILE;
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!metadataFile || !metadataUri) {
    return {
      shardId: process.env.SHARD_ID ?? String(PORT),
      host: process.env.ADVERTISE_HOST ?? "127.0.0.1",
      port: Number(process.env.ADVERTISE_PORT ?? PORT),
    };
  }

  const [file, task] = await Promise.all([readMetadataFile(metadataFile), readTaskMetadata(metadataUri)]);
  const taskId = task.TaskARN?.split("/").pop();
  // 이 컨테이너의 매핑. pause 컨테이너("~internal~ecs~pause-…")에도 같은 매핑이 있어 이름으로 고른다.
  const mapping = task.Containers?.find((c) => !c.Name?.startsWith("~internal~"))
    ?.Ports?.find((p) => p.ContainerPort === PORT && (p.Protocol ?? "tcp") === "tcp" && p.HostPort);
  if (!taskId || !file.HostPrivateIPv4Address || !mapping?.HostPort) {
    throw new Error(
      `ECS metadata is missing task id, host ip or the host port for ${PORT}: ` +
        JSON.stringify({ taskId, host: file.HostPrivateIPv4Address, ports: task.Containers?.map((c) => [c.Name, c.Ports]) }),
    );
  }
  return { shardId: process.env.SHARD_ID ?? taskId, host: file.HostPrivateIPv4Address, port: mapping.HostPort };
}
