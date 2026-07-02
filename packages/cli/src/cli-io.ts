import { readSync } from "node:fs";

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
  readStdin?(): string;
}

export const defaultIO: CliIO = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  readStdin: () => readLineFromStdin(),
};

export function readLineFromStdin(): string {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(1);
  while (true) {
    const bytesRead = readSync(0, buffer, 0, 1, null);
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    if (buffer[0] === 10) break;
  }
  return Buffer.concat(chunks).toString("utf8");
}
