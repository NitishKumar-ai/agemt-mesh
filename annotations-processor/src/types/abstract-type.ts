export abstract class AbstractType {
  constructor(
    readonly javaType: unknown,
    protected javaProtoType: string | null,
  ) {}

  getJavaType(): unknown {
    return this.javaType;
  }

  getJavaProtoType(): string | null {
    return this.javaProtoType;
  }

  abstract getProtoType(): string;
  abstract getRawJavaType(): string;
  abstract mapToProto(field: string, lines: string[]): void;
  abstract mapFromProto(field: string, lines: string[]): void;
  abstract getDependencies(deps: Set<string>): void;
  abstract generateAbstractMethods(specs: Set<string>): void;

  protected javaMethodName(m: string, field: string): string {
    return m + field.charAt(0).toUpperCase() + field.slice(1);
  }

  private static protoCase(s: string): string {
    const out: string[] = [];
    const len = s.length;
    let i = 0;
    let j = -1;
    while ((j = AbstractType.findWordBoundary(s, j + 1)) !== -1) {
      out.push(AbstractType.normalizeWord(s.substring(i, j)));
      if (j < len && s.charAt(j) === '_') j++;
      i = j;
    }
    if (i === 0) return AbstractType.normalizeWord(s);
    if (i < len) out.push(AbstractType.normalizeWord(s.substring(i)));
    return out.join('');
  }

  private static isWordBoundary(c: string): boolean {
    return c >= 'A' && c <= 'Z';
  }

  private static findWordBoundary(seq: string, start: number): number {
    const len = seq.length;
    if (start >= len) return -1;
    if (AbstractType.isWordBoundary(seq.charAt(start))) {
      let i = start;
      while (i < len && AbstractType.isWordBoundary(seq.charAt(i))) i++;
      return i;
    } else {
      for (let i = start; i < len; i++) {
        const c = seq.charAt(i);
        if (c === '_' || AbstractType.isWordBoundary(c)) return i;
      }
      return -1;
    }
  }

  private static normalizeWord(word: string): string {
    if (word.length < 2) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  protected protoMethodName(m: string, field: string): string {
    return m + AbstractType.protoCase(field);
  }
}
