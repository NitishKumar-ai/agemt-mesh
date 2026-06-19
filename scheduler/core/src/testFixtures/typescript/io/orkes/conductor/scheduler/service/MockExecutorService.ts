export class MockExecutorService {
    private command: (() => void) | null = null;

    public getCommand(): (() => void) | null {
        return this.command;
    }

    public scheduleWithFixedDelay(command: () => void, initialDelay: number, delay: number, unit: any): any {
        this.command = command;
        return null;
    }

    public schedule(command: any, delay: number, unit: any): any {
        return null;
    }

    public scheduleAtFixedRate(command: () => void, initialDelay: number, period: number, unit: any): any {
        return null;
    }

    public shutdown(): void {}

    public shutdownNow(): any[] | null {
        return null;
    }

    public isShutdown(): boolean {
        return false;
    }

    public isTerminated(): boolean {
        return false;
    }

    public awaitTermination(timeout: number, unit: any): boolean {
        return false;
    }

    public submit(task: any, result?: any): any {
        return null;
    }

    public invokeAll(tasks: any[], timeout?: number, unit?: any): any {
        return null;
    }

    public invokeAny(tasks: any[], timeout?: number, unit?: any): any {
        return null;
    }

    public execute(command: () => void): void {}
}
