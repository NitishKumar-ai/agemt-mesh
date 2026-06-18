export class VersionService {
  constructor(private readonly version: string) {}

  getVersion(): string {
    return this.version;
  }
}
