import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { MemoryManagerChoice, MemoryManagerIO } from "./memory-manager.js";

export class TerminalMemoryManagerIO implements MemoryManagerIO {
  readonly #readline: Interface;

  constructor() {
    this.#readline = createInterface({ input: stdin, output: stdout });
  }

  write(message: string): void {
    stdout.write(`${message}\n`);
  }

  async choose(
    prompt: string,
    choices: MemoryManagerChoice[],
    defaultValue?: string,
  ): Promise<string> {
    while (true) {
      this.write("");
      this.write(`${prompt}:`);
      choices.forEach((choice, index) => {
        const marker = choice.value === defaultValue ? " (default)" : "";
        this.write(`  ${index + 1}. ${choice.label}${marker}`);
      });
      const answer = (await this.#readline.question("> ")).trim();
      if (answer === "" && defaultValue !== undefined) return defaultValue;
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && choices[index] !== undefined) return choices[index].value;
      this.write(`Choose a number from 1 to ${choices.length}.`);
    }
  }

  async input(prompt: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue === undefined ? "" : ` [${defaultValue}]`;
    const answer = await this.#readline.question(`${prompt}${suffix}: `);
    return answer.trim() === "" && defaultValue !== undefined ? defaultValue : answer;
  }

  async confirm(prompt: string, confirmation = "yes"): Promise<boolean> {
    const answer = await this.#readline.question(`${prompt} Type ${confirmation} to confirm: `);
    return answer.trim() === confirmation;
  }

  close(): void {
    this.#readline.close();
  }
}
