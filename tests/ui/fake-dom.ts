// 画面モジュール（src/ui/dom）を Node 上で検査するための最小限の DOM。
// 実ブラウザの代用ではなく、組み立てとイベント配線の検査に必要な範囲だけを備える。

export class FakeElement {
  readonly tagName: string;
  className = '';
  type = '';
  title = '';
  disabled = false;
  textContent = '';
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private readonly listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.textContent += node;
        continue;
      }
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length);
    this.append(...nodes);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  get classList(): { add: (name: string) => void; contains: (name: string) => boolean } {
    return {
      add: (name: string) => {
        this.className = `${this.className} ${name}`.trim();
      },
      contains: (name: string) => this.className.split(' ').includes(name),
    };
  }

  closest(selector: string): FakeElement | null {
    const name = selector.replace('.', '');
    if (this.className.split(' ').includes(name)) {
      return this;
    }
    return this.parent?.closest(selector) ?? null;
  }

  querySelector(): null {
    return null;
  }

  setAttribute(): void {
    // 提示のみの属性は検査しない
  }

  // 自身と子孫の文字列を連結する（表示内容の検査に用いる）。
  text(): string {
    return [this.textContent, ...this.children.map((child) => child.text())].join(' ');
  }

  find(className: string): FakeElement | null {
    if (this.className.split(' ').includes(className)) {
      return this;
    }
    for (const child of this.children) {
      const found = child.find(className);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  findAll(className: string): FakeElement[] {
    const found = this.className.split(' ').includes(className) ? [this as FakeElement] : [];
    return [...found, ...this.children.flatMap((child) => child.findAll(className))];
  }
}

// 画面モジュールが用いる最小限のグローバルを備える。
export function installFakeDom(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.Element = FakeElement;
  globals.HTMLElement = FakeElement;
  globals.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
    createTextNode: (text: string) => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    },
  };
}
