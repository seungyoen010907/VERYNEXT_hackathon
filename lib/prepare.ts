import "server-only";

// 업로드 파일 → OpenAI 입력으로 바꾸기 (docs/API.md 6번 "자료를 AI에 넣는 방법").
// 형식은 확장자가 아니라 파일 앞부분(매직 넘버)으로 판별한다.

import type { ResponseInputContent } from "openai/resources/responses/responses";
import * as XLSX from "xlsx";
import type { DocumentKind } from "./types";

const MAX_ROWS_PER_SHEET = 2000;

// 사용자에게 그대로 보여줄 수 있는 에러 (route에서 400으로 바꾼다)
export class PrepareError extends Error {}

export type DetectedFile = {
  kind: DocumentKind;
  mime: string;
};

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function detectKind(bytes: Uint8Array, fileName: string): DetectedFile {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { kind: "pdf", mime: "application/pdf" }; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { kind: "image", mime: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };

  // 아이폰 HEIC 사진: ....ftypheic
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(bytes, 8, 12))) {
    throw new PrepareError(`${fileName}: 아이폰 HEIC 사진은 읽을 수 없어요. JPG나 PNG로 바꿔서 올려주세요.`);
  }

  // XLSX는 zip 파일이라 PK로 시작한다. 같은 zip인 docx·hwpx와 구분하려고 확장자도 본다.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && ext === "xlsx") {
    return { kind: "spreadsheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  // 옛 엑셀(XLS)은 OLE 형식. 같은 형식인 hwp·doc과 구분하려고 확장자도 본다.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]) && ext === "xls") {
    return { kind: "spreadsheet", mime: "application/vnd.ms-excel" };
  }

  // CSV는 매직 넘버가 없다. 확장자가 csv이고 앞부분에 0x00(바이너리 표시)이 없으면 텍스트로 본다.
  if (ext === "csv" && !bytes.subarray(0, 1024).includes(0)) return { kind: "csv", mime: "text/csv" };

  throw new PrepareError(`${fileName}: 지원하지 않는 파일이에요. PDF, JPG, PNG, WEBP, 엑셀(XLSX, XLS), CSV만 올릴 수 있어요.`);
}

// 카드사·배달앱 CSV는 EUC-KR이 많다. UTF-8로 읽어 보고 깨지면 EUC-KR로 다시 읽는다.
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

function limitRows(csv: string): string {
  const lines = csv.split(/\r?\n/);
  if (lines.length <= MAX_ROWS_PER_SHEET) return csv;
  return lines.slice(0, MAX_ROWS_PER_SHEET).join("\n") + `\n(이하 ${lines.length - MAX_ROWS_PER_SHEET}행 생략)`;
}

function spreadsheetToText(bytes: Uint8Array, fileName: string): string {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array" });
  } catch {
    throw new PrepareError(`${fileName}: 엑셀 파일을 열 수 없어요. 파일이 손상되지 않았는지 확인해주세요.`);
  }
  return workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
    return `[시트: ${name}]\n${limitRows(csv)}`;
  }).join("\n\n");
}

// 파일명에 따옴표나 꺾쇠가 있어도 <file> 태그가 깨지지 않게
function safeName(fileName: string): string {
  return fileName.replace(/["<>]/g, "_");
}

export function prepareFile(fileName: string, bytes: Uint8Array): ResponseInputContent[] {
  const { kind, mime } = detectKind(bytes, fileName);
  const name = safeName(fileName);
  const open: ResponseInputContent = { type: "input_text", text: `<file name="${name}">` };
  const close: ResponseInputContent = { type: "input_text", text: "</file>" };
  const base64 = Buffer.from(bytes).toString("base64");

  let body: ResponseInputContent;
  if (kind === "pdf") {
    body = { type: "input_file", filename: name, file_data: `data:${mime};base64,${base64}` };
  } else if (kind === "image") {
    body = { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "high" };
  } else if (kind === "spreadsheet") {
    body = { type: "input_text", text: spreadsheetToText(bytes, fileName) };
  } else {
    body = { type: "input_text", text: limitRows(decodeText(bytes)) };
  }
  return [open, body, close];
}
