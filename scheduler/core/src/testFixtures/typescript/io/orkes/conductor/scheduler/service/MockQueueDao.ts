export class MockQueueDao {
    public dummyQueues: Map<string, Map<string, Map<string, any>>> = new Map();
    public counters: Map<string, number> = new Map();

    public clearCounter(): void {
        this.counters.clear();
    }

    public getCounter(apiName: string): number {
        return this.counters.get(apiName) || 0;
    }

    public push(queueName: string, id: string, offsetTimeInSecond: number): void;
    public push(queueName: string, id: string, priority: number, offsetTimeInSecond: number): void;
    public push(queueName: string, id: string, priority: number, offsetTime: any): void;
    public push(queueName: string, messages: any[]): void;
    public push(queueName: string, arg2: any, arg3?: any, arg4?: any): void {
        if (Array.isArray(arg2)) {
            throw new Error("not implemented");
        }
        
        const id = arg2 as string;
        if (!this.dummyQueues.has(queueName)) {
            this.dummyQueues.set(queueName, new Map());
        }
        if (!this.dummyQueues.get(queueName)!.has(id)) {
            this.dummyQueues.get(queueName)!.set(id, new Map());
        }
        
        if (typeof arg3 === "number" && arg4 === undefined) {
            this.dummyQueues.get(queueName)!.get(id)!.set("offsetTimeInSecond", arg3);
            this.incrementCounter("push");
        } else if (typeof arg3 === "number" && typeof arg4 === "number") {
            this.dummyQueues.get(queueName)!.get(id)!.set("priority", arg3);
            this.dummyQueues.get(queueName)!.get(id)!.set("offsetTimeInSecond", arg4);
            this.incrementCounter("pushWithPriority");
        } else if (typeof arg3 === "number" && arg4 !== undefined) {
            this.dummyQueues.get(queueName)!.get(id)!.set("priority", arg3);
            this.dummyQueues.get(queueName)!.get(id)!.set("offsetTimeInSecond", arg4.getSeconds ? arg4.getSeconds() : 0);
            this.dummyQueues.get(queueName)!.get(id)!.set("offsetTimeInMs", arg4.toMillis ? arg4.toMillis() : 0);
            this.incrementCounter("pushWithPriority");
        }
    }

    private incrementCounter(apiName: string): void {
        this.counters.set(apiName, (this.counters.get(apiName) || 0) + 1);
    }

    public pushIfNotExists(queueName: string, id: string, offsetTimeInSecond: number): boolean;
    public pushIfNotExists(queueName: string, id: string, priority: number, offsetTimeInSecond: number): boolean;
    public pushIfNotExists(queueName: string, id: string, arg3: number, arg4?: number): boolean {
        let isPriority = arg4 !== undefined;
        let priority = isPriority ? arg3 : undefined;
        let offsetTimeInSecond = isPriority ? arg4 : arg3;
        
        this.incrementCounter(isPriority ? "pushIfNotExistsWithPriority" : "pushIfNotExists");
        
        if (!this.dummyQueues.has(queueName)) {
            this.dummyQueues.set(queueName, new Map());
        }
        
        if (!this.dummyQueues.get(queueName)!.has(id)) {
            this.dummyQueues.get(queueName)!.set(id, new Map());
            if (isPriority) {
                this.dummyQueues.get(queueName)!.get(id)!.set("priority", priority);
            }
            this.dummyQueues.get(queueName)!.get(id)!.set("offsetTimeInSecond", offsetTimeInSecond);
            return true;
        }
        return false;
    }

    public pop(queueName: string, count: number, timeout: number): string[] {
        this.incrementCounter("pop-" + queueName);
        const messages: string[] = [];
        const queue = this.dummyQueues.get(queueName);
        if (queue && queue.size > 0) {
            messages.push(queue.keys().next().value);
        }
        return messages;
    }

    public pollMessages(queueName: string, count: number, timeout: number): any[] {
        throw new Error("not implemented");
    }

    public remove(queueName: string, messageId: string): void {
        const q = this.dummyQueues.get(queueName);
        if (q) {
            q.delete(messageId);
        }
    }

    public getSize(queueName: string): number {
        throw new Error("not implemented");
    }

    public ack(queueName: string, messageId: string): boolean {
        this.incrementCounter("ack");
        if (!this.dummyQueues.has(queueName)) {
            this.dummyQueues.set(queueName, new Map());
        }
        if (this.dummyQueues.get(queueName)!.has(messageId)) {
            this.dummyQueues.get(queueName)!.delete(messageId);
            return true;
        }
        return false;
    }

    public setUnackTimeout(queueName: string, messageId: string, unackTimeout: number): boolean {
        throw new Error("not implemented");
    }

    public flush(queueName: string): void {
        throw new Error("not implemented");
    }

    public queuesDetail(): Map<string, number> {
        throw new Error("not implemented");
    }

    public queuesDetailVerbose(): Map<string, Map<string, Map<string, number>>> {
        throw new Error("not implemented");
    }

    public resetOffsetTime(queueName: string, id: string): boolean {
        throw new Error("not implemented");
    }

    public clearData(): void {
        this.dummyQueues.clear();
    }
}
