/**
 * 파일 저장소
 * 로컬 모드: .data/uploads 아래에 저장한다.
 * Supabase 모드: 추후 같은 인터페이스로 Supabase Storage를 구현한다 (storage_path 형식 동일).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** 로컬 데이터 폴더. 테스트는 LOCAL_DATA_DIR 로 임시 폴더를 지정한다. */
export function localDataDir(): string {
  return resolve(process.env.LOCAL_DATA_DIR ?? resolve(process.cwd(), ".data"));
}

function fullPath(storagePath: string): string {
  const root = resolve(localDataDir(), "uploads");
  const p = resolve(root, storagePath);
  if (!p.startsWith(root + "/")) throw new Error("잘못된 저장 경로");
  return p;
}

export async function saveFile(storagePath: string, bytes: Uint8Array): Promise<void> {
  const p = fullPath(storagePath);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(fullPath(storagePath));
}

/** 저장 경로에 쓸 안전한 파일명 (경로 구분자·제어문자 제거) */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFC").replace(/[\\/\x00-\x1f<>:"|?*]/g, "_").replace(/^\.+/, "_");
  return cleaned.slice(-120) || "file";
}
